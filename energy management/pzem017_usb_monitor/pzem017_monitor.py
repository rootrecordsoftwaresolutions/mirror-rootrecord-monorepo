"""
PZEM-017 DC meter monitor for Windows (USB serial / USB-RS485).

Serial: Peacefair / community docs use Modbus RTU at 9600 baud, 8 data bits, no parity, 2 stop bits
(same defaults as e.g. github.com/mar-svo/PZEM-017: pymodbus RTU stopbits=2).

Protocol: FC 0x04, start address 0, 8 input registers, CRC16-Modbus.
"""

from __future__ import annotations

import queue
import sqlite3
import sys
import subprocess
from collections import deque
from datetime import date, datetime
import threading
import time
import tkinter as tk
import re
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

try:
    import serial
    import serial.tools.list_ports
except ImportError as e:  # pragma: no cover
    raise SystemExit("Install pyserial: pip install pyserial") from e

try:
    import matplotlib

    matplotlib.use("TkAgg", force=True)
    from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    from matplotlib.dates import ConciseDateFormatter
    from matplotlib.figure import Figure
    import matplotlib.dates as mdates
except ImportError:  # pragma: no cover
    FigureCanvasTkAgg = None  # type: ignore[misc, assignment]
    Figure = None  # type: ignore[misc, assignment]
    mdates = None  # type: ignore[misc, assignment]


def crc16_modbus(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def rs485_turnaround_s(baud: int) -> float:
    """Minimum silence after TX before RX on half-duplex USB–RS485 (auto DE/RE often needs a few ms)."""
    char_s = 11.0 / float(max(baud, 300))
    return max(0.015, 1.5 * char_s)


def read_modbus_rtu_n(ser: serial.Serial, nbytes: int, total_timeout_s: float) -> bytes:
    """Read exactly ``nbytes`` or whatever arrived before ``total_timeout_s`` (pyserial ``read(n)`` can return early)."""
    deadline = time.perf_counter() + max(float(total_timeout_s), 0.05)
    buf = b""
    while len(buf) < nbytes and time.perf_counter() < deadline:
        chunk = ser.read(nbytes - len(buf))
        if chunk:
            buf += chunk
    return buf


def build_read_input_registers(slave: int, start_addr: int, quantity: int) -> bytes:
    if not (1 <= slave <= 247):
        raise ValueError("slave")
    if not (1 <= quantity <= 125):
        raise ValueError("quantity")
    pdu = bytes([slave, 0x04, (start_addr >> 8) & 0xFF, start_addr & 0xFF, (quantity >> 8) & 0xFF, quantity & 0xFF])
    c = crc16_modbus(pdu)
    return pdu + bytes([c & 0xFF, (c >> 8) & 0xFF])


def verify_crc(frame: bytes) -> bool:
    if len(frame) < 3:
        return False
    return crc16_modbus(frame[:-2]) == (frame[-2] | (frame[-1] << 8))


def parse_pzem017_input_block(resp: bytes) -> dict[str, float | int | bool]:
    """Parse 21-byte FC0x04 response: 8 regs (16 bytes) + header + CRC."""
    if len(resp) != 21 or resp[1] != 0x04 or resp[2] != 0x10:
        raise ValueError("bad frame layout")
    if not verify_crc(resp):
        raise ValueError("crc")

    def u16(i: int) -> int:
        return (resp[i] << 8) | resp[i + 1]

    v_raw = u16(3)
    i_raw = u16(5)
    p_lo = u16(7)
    p_hi = u16(9)
    e_lo = u16(11)
    e_hi = u16(13)
    hv_alarm = u16(15)
    lv_alarm = u16(17)

    power_raw = (p_hi << 16) | p_lo
    energy_wh_raw = (e_hi << 16) | e_lo

    return {
        "voltage_v": v_raw / 100.0,
        "current_a": i_raw / 100.0,
        "power_w": power_raw / 10.0,
        "energy_kwh": energy_wh_raw / 1000.0,
        "hv_alarm": hv_alarm != 0,
        "lv_alarm": lv_alarm != 0,
    }


def default_readings_db_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "pzem017_readings.db"
    return Path(__file__).resolve().parent / "pzem017_readings.db"


def open_readings_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30.0, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts REAL NOT NULL,
            voltage_v REAL NOT NULL,
            current_a REAL NOT NULL,
            power_w REAL NOT NULL,
            energy_kwh REAL NOT NULL,
            hv_alarm INTEGER NOT NULL,
            lv_alarm INTEGER NOT NULL,
            rtt_ms REAL NOT NULL,
            slave INTEGER NOT NULL,
            circuit TEXT NOT NULL DEFAULT 'A'
        )
        """
    )
    _migrate_readings_schema(conn)
    conn.execute("CREATE INDEX IF NOT EXISTS ix_readings_ts ON readings(ts)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_readings_ts_circuit ON readings(ts, circuit)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts REAL NOT NULL,
            kind TEXT NOT NULL,
            message TEXT NOT NULL,
            value REAL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS ix_event_log_ts ON event_log(ts)")
    return conn


def db_range_stats(db_path: Path, t_from: float, circuit: str | None = None) -> tuple | None:
    """COUNT, AVG V/I/P, min/max V/I/P, min/max energy for rows with ts >= t_from (optional circuit)."""
    if not db_path.is_file():
        return None
    try:
        conn = sqlite3.connect(str(db_path), timeout=15.0)
        try:
            if circuit:
                row = conn.execute(
                    """
                    SELECT COUNT(*),
                           AVG(voltage_v), AVG(current_a), AVG(power_w),
                           MIN(voltage_v), MAX(voltage_v),
                           MIN(current_a), MAX(current_a),
                           MIN(power_w), MAX(power_w),
                           MIN(energy_kwh), MAX(energy_kwh)
                    FROM readings WHERE ts >= ? AND circuit = ?
                    """,
                    (t_from, circuit),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT COUNT(*),
                           AVG(voltage_v), AVG(current_a), AVG(power_w),
                           MIN(voltage_v), MAX(voltage_v),
                           MIN(current_a), MAX(current_a),
                           MIN(power_w), MAX(power_w),
                           MIN(energy_kwh), MAX(energy_kwh)
                    FROM readings WHERE ts >= ?
                    """,
                    (t_from,),
                ).fetchone()
        finally:
            conn.close()
        return row
    except sqlite3.Error:
        return None


def db_bucketed_series(
    db_path: Path, t_from: float, bucket_sec: int, circuit: str | None = None
) -> tuple[list[float], list[float], list[float], list[float]] | None:
    """Return (t_unix_mid, v_avg, i_avg, p_avg) per bucket. Empty lists if none."""
    if not db_path.is_file() or bucket_sec < 1:
        return None
    try:
        conn = sqlite3.connect(str(db_path), timeout=30.0)
        try:
            if circuit:
                rows = conn.execute(
                    """
                    SELECT AVG(ts), AVG(voltage_v), AVG(current_a), AVG(power_w)
                    FROM readings
                    WHERE ts >= ? AND circuit = ?
                    GROUP BY CAST((ts - ?) / ? AS INTEGER)
                    ORDER BY 1
                    """,
                    (t_from, circuit, t_from, bucket_sec),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT AVG(ts), AVG(voltage_v), AVG(current_a), AVG(power_w)
                    FROM readings
                    WHERE ts >= ?
                    GROUP BY CAST((ts - ?) / ? AS INTEGER)
                    ORDER BY 1
                    """,
                    (t_from, t_from, bucket_sec),
                ).fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    tx, vv, ii, pp = [], [], [], []
    for r in rows:
        if r[0] is None:
            continue
        tx.append(float(r[0]))
        vv.append(float(r[1] or 0))
        ii.append(float(r[2] or 0))
        pp.append(float(r[3] or 0))
    return tx, vv, ii, pp


# End-of-day (quiet): sustained near-zero *production* (P and I) so brief clouds/rain do not end the solar day.
# ~40 V nominal string: Voc can stay high after sunset; use P+I not V. Longer window rejects passing clouds.
DAY_END_QUIET_S = 120.0
DAY_END_LOW_POWER_W = 8.0
DAY_END_LOW_CURRENT_A = 0.20
# Start of production day: this many consecutive readings with V strictly above this threshold.
DAY_START_VOLTAGE_V = 5.0
DAY_START_CONSECUTIVE = 3
# After day_end, block counting toward the next day_start until this much wall time elapses.
# This is NOT a fixed "calendar 24h" window — it only separates sunset from the next sunrise streak,
# so changing solar day length through the seasons does not drift or overlap like rolling UTC midnight would.
DAY_START_COOLDOWN_AFTER_DAY_END_S = 10 * 3600

# Two isolated PV strings / USB–RS485 adapters (same SQLite file, `circuit` column).
CIRCUIT_A = "A"
CIRCUIT_B = "B"
CIRCUITS: tuple[str, ...] = (CIRCUIT_A, CIRCUIT_B)


def _migrate_readings_schema(conn: sqlite3.Connection) -> None:
    """Add `circuit` column to legacy databases."""
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(readings)")}
    if "circuit" not in cols:
        conn.execute("ALTER TABLE readings ADD COLUMN circuit TEXT NOT NULL DEFAULT 'A'")


def _windows_prevent_sleep(enable: bool) -> None:
    """While monitoring, ask Windows not to idle-sleep so overnight runs still catch the exact reconnect."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        ES_CONTINUOUS = 0x80000000
        ES_SYSTEM_REQUIRED = 0x00000001
        if enable:
            ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
        else:
            ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
    except Exception:
        pass


def _windows_power_status() -> dict | None:
    """Return power status (AC/battery/percent). Windows only."""
    if sys.platform != "win32":
        return None
    try:
        import ctypes

        class SYSTEM_POWER_STATUS(ctypes.Structure):
            _fields_ = [
                ("ACLineStatus", ctypes.c_ubyte),
                ("BatteryFlag", ctypes.c_ubyte),
                ("BatteryLifePercent", ctypes.c_ubyte),
                ("SystemStatusFlag", ctypes.c_ubyte),
                ("BatteryLifeTime", ctypes.c_ulong),
                ("BatteryFullLifeTime", ctypes.c_ulong),
            ]

        s = SYSTEM_POWER_STATUS()
        if ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(s)) == 0:
            return None

        ac = {0: "battery", 1: "ac", 255: "unknown"}.get(int(s.ACLineStatus), "unknown")
        pct = None if int(s.BatteryLifePercent) == 255 else int(s.BatteryLifePercent)
        return {"ac": ac, "pct": pct}
    except Exception:
        return None


def _windows_wifi_status() -> dict | None:
    """Return Wi‑Fi status (connected/ssid/signal). Windows only."""
    if sys.platform != "win32":
        return None
    try:
        creationflags = 0
        startupinfo = None
        try:
            # Prevent any console window from flashing open.
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0  # SW_HIDE
        except Exception:
            creationflags = 0
            startupinfo = None
        cp = subprocess.run(
            ["netsh", "wlan", "show", "interfaces"],
            capture_output=True,
            text=True,
            timeout=2.0,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        txt = (cp.stdout or "") + "\n" + (cp.stderr or "")
        if not txt.strip():
            return None
        # netsh output is localized on some systems; we key off common English labels but keep it best-effort.
        state = None
        ssid = None
        signal = None
        for line in txt.splitlines():
            if ":" not in line:
                continue
            k, v = line.split(":", 1)
            k = k.strip().lower()
            v = v.strip()
            if k == "state":
                state = v.lower()
            elif k == "ssid":
                # Avoid BSSID lines
                if "bssid" not in line.lower():
                    ssid = v
            elif k == "signal":
                m = re.search(r"(\d+)\s*%", v)
                if m:
                    signal = int(m.group(1))
        if state is None:
            return None
        connected = "connected" in state
        return {"connected": connected, "ssid": ssid, "signal": signal}
    except Exception:
        return None


class ReaderThread(threading.Thread):
    def __init__(
        self,
        out_q: queue.Queue,
        cfg_q: queue.Queue,
        *,
        circuit_id: str,
        port: str,
        baud: int,
        slave: int,
        stopbits: int,
        read_timeout_s: float,
        poll_delay_s: float,
        discard_before_write: bool,
        log_db: bool,
        db_path: str,
        rs485_rts_mode: int = 0,
    ) -> None:
        super().__init__(daemon=True)
        self.out_q = out_q
        self.cfg_q = cfg_q
        self.circuit_id = circuit_id
        self._stop = threading.Event()
        self.port = port
        self.baud = baud
        self.slave = slave
        self.stopbits = stopbits
        self.read_timeout_s = read_timeout_s
        self.poll_delay_s = poll_delay_s
        self.discard_before_write = discard_before_write
        self.log_db = log_db
        self.db_path = db_path
        self.rs485_rts_mode = int(rs485_rts_mode)

    def _tag(self, msg: dict) -> dict:
        msg["circuit"] = self.circuit_id
        return msg

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        ser: serial.Serial | None = None
        db_conn: sqlite3.Connection | None = None
        ok = 0
        err = 0
        t_ok_start = time.perf_counter()
        last_db_err: float = 0.0

        def close_db() -> None:
            nonlocal db_conn
            if db_conn:
                try:
                    db_conn.close()
                except Exception:
                    pass
                db_conn = None

        def sync_db_connection() -> None:
            nonlocal db_conn
            if self.log_db and self.db_path.strip():
                p = Path(self.db_path.strip())
                if db_conn is None:
                    try:
                        db_conn = open_readings_db(p)
                    except Exception as e:
                        self.out_q.put(self._tag({"type": "db_error", "message": f"Database: {e}"}))
                        close_db()
            else:
                close_db()

        def apply_cfg_updates() -> bool:
            nonlocal ser
            changed = False
            while True:
                try:
                    msg = self.cfg_q.get_nowait()
                except queue.Empty:
                    break
                if msg[0] == "stop":
                    return False
                if msg[0] == "update":
                    (
                        self.port,
                        self.baud,
                        self.slave,
                        self.stopbits,
                        self.read_timeout_s,
                        self.poll_delay_s,
                        self.discard_before_write,
                        self.log_db,
                        self.db_path,
                        self.rs485_rts_mode,
                    ) = msg[1]
                    changed = True
            if changed and ser and ser.is_open:
                try:
                    ser.close()
                except Exception:
                    pass
                ser = None
            if changed:
                close_db()
                sync_db_connection()
            return True

        try:
            sync_db_connection()
            while not self._stop.is_set():
                if not apply_cfg_updates():
                    break

                if ser is None or not ser.is_open:
                    try:
                        sb = serial.STOPBITS_TWO if self.stopbits == 2 else serial.STOPBITS_ONE
                        ser = serial.Serial(
                            port=self.port,
                            baudrate=self.baud,
                            bytesize=serial.EIGHTBITS,
                            parity=serial.PARITY_NONE,
                            stopbits=sb,
                            timeout=self.read_timeout_s,
                            write_timeout=self.read_timeout_s,
                        )
                        try:
                            ser.reset_input_buffer()
                        except Exception:
                            pass
                    except Exception as e:
                        self.out_q.put(self._tag({"type": "error", "message": f"Open failed: {e}"}))
                        time.sleep(0.5)
                        continue

                req = build_read_input_registers(self.slave, 0x0000, 8)
                try:
                    if self.discard_before_write:
                        ser.reset_input_buffer()
                    t0 = time.perf_counter()
                    try:
                        if self.rs485_rts_mode == 1:
                            ser.rts = True
                        elif self.rs485_rts_mode == 2:
                            ser.rts = False
                    except Exception:
                        pass
                    ser.write(req)
                    try:
                        ser.flush()
                    except Exception:
                        pass
                    try:
                        if self.rs485_rts_mode == 1:
                            ser.rts = False
                        elif self.rs485_rts_mode == 2:
                            ser.rts = True
                    except Exception:
                        pass
                    time.sleep(rs485_turnaround_s(self.baud))
                    payload = read_modbus_rtu_n(ser, 21, self.read_timeout_s)
                    dt = time.perf_counter() - t0

                    if len(payload) != 21:
                        err += 1
                        try:
                            ser.reset_input_buffer()
                        except Exception:
                            pass
                        self.out_q.put(
                            self._tag(
                                {
                                    "type": "sample_err",
                                    "reason": f"short read {len(payload)}",
                                    "dt": dt,
                                    "ok": ok,
                                    "err": err,
                                }
                            )
                        )
                    elif payload[0] != self.slave or payload[1] != 0x04:
                        err += 1
                        try:
                            ser.reset_input_buffer()
                        except Exception:
                            pass
                        self.out_q.put(
                            self._tag({"type": "sample_err", "reason": "unexpected hdr", "dt": dt, "ok": ok, "err": err})
                        )
                    else:
                        data = parse_pzem017_input_block(payload)
                        ok += 1
                        if ok == 1:
                            t_ok_start = time.perf_counter()
                        elapsed = max(1e-9, time.perf_counter() - t_ok_start)
                        hz = ok / elapsed
                        wall_ts = time.time()
                        mono_ts = time.monotonic()
                        if db_conn is not None:
                            try:
                                db_conn.execute(
                                    """
                                    INSERT INTO readings
                                    (ts, voltage_v, current_a, power_w, energy_kwh, hv_alarm, lv_alarm, rtt_ms, slave, circuit)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """,
                                    (
                                        wall_ts,
                                        data["voltage_v"],
                                        data["current_a"],
                                        data["power_w"],
                                        data["energy_kwh"],
                                        1 if data["hv_alarm"] else 0,
                                        1 if data["lv_alarm"] else 0,
                                        dt * 1000.0,
                                        self.slave,
                                        self.circuit_id,
                                    ),
                                )
                            except Exception as e:
                                now = time.perf_counter()
                                if now - last_db_err > 5.0:
                                    last_db_err = now
                                    self.out_q.put(self._tag({"type": "db_error", "message": f"Database write: {e}"}))
                        self.out_q.put(
                            self._tag(
                                {
                                    "type": "sample_ok",
                                    "wall_ts": wall_ts,
                                    "mono_ts": mono_ts,
                                    "data": data,
                                    "dt": dt,
                                    "hz": hz,
                                    "ok": ok,
                                    "err": err,
                                }
                            )
                        )
                except Exception as e:
                    err += 1
                    self.out_q.put(self._tag({"type": "sample_err", "reason": str(e), "dt": 0.0, "ok": ok, "err": err}))
                    try:
                        ser.close()
                    except Exception:
                        pass
                    ser = None
                    time.sleep(0.2)
                    continue

                if self.poll_delay_s > 0:
                    time.sleep(self.poll_delay_s)
        finally:
            close_db()
            if ser and ser.is_open:
                try:
                    ser.close()
                except Exception:
                    pass
            self.out_q.put(self._tag({"type": "stopped"}))


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("PZEM-017 USB / Modbus monitor (A + B)")
        self.geometry("1100x880")

        self.out_q: queue.Queue = queue.Queue()
        self.cfg_q: dict[str, queue.Queue] = {CIRCUIT_A: queue.Queue(), CIRCUIT_B: queue.Queue()}
        self._readers: dict[str, ReaderThread | None] = {CIRCUIT_A: None, CIRCUIT_B: None}
        self._circ_day: dict[str, dict] = {
            c: {
                "in_production_day": False,
                "high_v_streak": 0,
                "peak_w_today": float("-inf"),
                "low_power_since_wall": None,
                "next_day_start_allowed_ts": None,
            }
            for c in CIRCUITS
        }
        self._sys_last_power: dict | None = None
        self._sys_last_wifi: dict | None = None
        self._app_closing = False
        self._reader_reconnect_after: dict[str, str | None] = {CIRCUIT_A: None, CIRCUIT_B: None}
        self._last_comm_err: dict[str, str | None] = {CIRCUIT_A: None, CIRCUIT_B: None}

        top = ttk.Frame(self, padding=8)
        top.pack(fill=tk.X)

        ttk.Label(top, text="Circuit A — COM").grid(row=0, column=0, sticky=tk.W)
        self.cb_port_a = ttk.Combobox(top, width=16)
        self.cb_port_a.grid(row=0, column=1, sticky=tk.W, padx=(4, 16))

        ttk.Label(top, text="Circuit B — COM").grid(row=0, column=2, sticky=tk.W)
        self.cb_port_b = ttk.Combobox(top, width=16)
        self.cb_port_b.grid(row=0, column=3, sticky=tk.W, padx=(4, 12))

        ttk.Button(top, text="Refresh ports", command=self.refresh_ports).grid(row=0, column=4, padx=(8, 0))

        ttk.Label(top, text="Baud").grid(row=1, column=0, sticky=tk.W, pady=(6, 0))
        self.cb_baud = ttk.Combobox(top, width=8, values=("9600", "19200", "38400", "57600", "115200"))
        self.cb_baud.set("9600")
        self.cb_baud.grid(row=1, column=1, sticky=tk.W, padx=(4, 16), pady=(6, 0))

        ttk.Label(top, text="Slave").grid(row=1, column=2, sticky=tk.W, pady=(6, 0))
        self.sp_slave = ttk.Spinbox(top, from_=1, to=247, width=5)
        self.sp_slave.delete(0, tk.END)
        self.sp_slave.insert(0, "1")
        self.sp_slave.grid(row=1, column=3, sticky=tk.W, padx=(4, 12), pady=(6, 0))

        ttk.Label(top, text="Stop bits").grid(row=1, column=4, sticky=tk.W, pady=(6, 0))
        self.cb_stop = ttk.Combobox(top, width=4, state="readonly", values=("1", "2"))
        self.cb_stop.set("2")
        self.cb_stop.grid(row=1, column=5, sticky=tk.W, padx=(4, 0), pady=(6, 0))

        row1 = ttk.Frame(self, padding=(8, 0))
        row1.pack(fill=tk.X)
        ttk.Label(row1, text="Read timeout (ms)").pack(side=tk.LEFT)
        self.sp_read_ms = ttk.Spinbox(row1, from_=50, to=5000, width=6)
        self.sp_read_ms.delete(0, tk.END)
        # Default high enough for USB–RS485 (avoid RTT barely exceeding timeout with 0 bytes).
        self.sp_read_ms.insert(0, "1000")
        self.sp_read_ms.pack(side=tk.LEFT, padx=(4, 4))
        ttk.Label(row1, text="(raise if short reads)", font=("Segoe UI", 8), foreground="#555").pack(
            side=tk.LEFT, padx=(0, 16)
        )

        ttk.Label(row1, text="Extra delay after each poll (ms)").pack(side=tk.LEFT)
        self.sp_delay_ms = ttk.Spinbox(row1, from_=0, to=5000, width=6)
        self.sp_delay_ms.delete(0, tk.END)
        self.sp_delay_ms.insert(0, "0")
        self.sp_delay_ms.pack(side=tk.LEFT, padx=(4, 16))

        self.var_discard = tk.BooleanVar(value=False)
        ttk.Checkbutton(row1, text="Clear RX before each request", variable=self.var_discard).pack(side=tk.LEFT)
        ttk.Label(row1, text="RS485 RTS").pack(side=tk.LEFT, padx=(12, 2))
        self.cb_rs485_rts = ttk.Combobox(
            row1,
            width=20,
            state="readonly",
            values=("Off", "RTS high while TX", "RTS low while TX"),
        )
        self.cb_rs485_rts.set("Off")
        self.cb_rs485_rts.pack(side=tk.LEFT, padx=(0, 8))

        row_db = ttk.Frame(self, padding=(8, 4))
        row_db.pack(fill=tk.X)
        self.var_log_db = tk.BooleanVar(value=True)
        ttk.Checkbutton(row_db, text="SQLite: save every good reading", variable=self.var_log_db).pack(side=tk.LEFT)
        ttk.Label(row_db, text="Database file").pack(side=tk.LEFT, padx=(12, 4))
        self.ent_db_path = ttk.Entry(row_db, width=52)
        self.ent_db_path.insert(0, str(default_readings_db_path()))
        self.ent_db_path.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))
        ttk.Button(row_db, text="Browse…", command=self._browse_db).pack(side=tk.LEFT)

        row2 = ttk.Frame(self, padding=8)
        row2.pack(fill=tk.X)
        self.btn_apply = ttk.Button(row2, text="Apply settings (live)", command=self.apply_live)
        self.btn_apply.pack(side=tk.LEFT)
        ttk.Label(row2, text="Monitoring starts automatically.", font=("Segoe UI", 9), foreground="#555").pack(
            side=tk.LEFT, padx=(16, 0)
        )

        self.protocol("WM_DELETE_WINDOW", self._on_close_window)

        self.main_nb = ttk.Notebook(self)
        self.main_nb.pack(fill=tk.BOTH, expand=True, padx=8, pady=(0, 8))
        self.main_nb.bind("<<NotebookTabChanged>>", self._on_main_tab_changed)

        tab_mon = ttk.Frame(self.main_nb)
        self.main_nb.add(tab_mon, text="Monitor")
        tab_mon.grid_columnconfigure(0, weight=1)
        tab_mon.grid_columnconfigure(1, weight=1)
        tab_mon.grid_rowconfigure(0, weight=0)
        tab_mon.grid_rowconfigure(1, weight=1)

        self._big = ("Segoe UI", 15)
        self._med = ("Segoe UI", 9)
        self._small = ("Segoe UI", 8)

        def _build_circuit_panel(parent: ttk.Frame, title: str) -> dict[str, ttk.Widget]:
            lf = ttk.LabelFrame(parent, text=title, padding=(10, 8, 10, 10))
            for c in range(4):
                lf.grid_columnconfigure(c, weight=1, uniform="meas")
            row_m = ttk.Frame(lf)
            row_m.grid(row=0, column=0, columnspan=4, sticky="ew", pady=(0, 6))
            for c in range(4):
                row_m.grid_columnconfigure(c, weight=1)
            w: dict[str, ttk.Widget] = {}
            w["v"] = ttk.Label(row_m, text="— V", font=self._big, anchor="center")
            w["v"].grid(row=0, column=0, sticky="ew", padx=(4, 8))
            w["i"] = ttk.Label(row_m, text="— A", font=self._big, anchor="center")
            w["i"].grid(row=0, column=1, sticky="ew", padx=(8, 8))
            w["p"] = ttk.Label(row_m, text="— W", font=self._big, anchor="center")
            w["p"].grid(row=0, column=2, sticky="ew", padx=(8, 8))
            w["e"] = ttk.Label(row_m, text="— kWh", font=self._big, anchor="center")
            w["e"].grid(row=0, column=3, sticky="ew", padx=(8, 4))
            w["al"] = ttk.Label(lf, text="Alarms: —", font=self._med, anchor="center")
            w["al"].grid(row=1, column=0, columnspan=4, sticky="ew", pady=(2, 0))
            w["st"] = ttk.Label(lf, text="Idle", font=("Segoe UI", 9), wraplength=280, justify=tk.LEFT)
            w["st"].grid(row=2, column=0, columnspan=4, sticky="nw", pady=(8, 0))
            return {"frame": lf, **w}

        pa = _build_circuit_panel(tab_mon, "Circuit A")
        pa["frame"].grid(row=0, column=0, sticky="nsew", padx=(2, 4), pady=2)
        pb = _build_circuit_panel(tab_mon, "Circuit B")
        pb["frame"].grid(row=0, column=1, sticky="nsew", padx=(4, 2), pady=2)

        self._circ_lbl: dict[str, dict[str, ttk.Widget]] = {
            CIRCUIT_A: {k: pa[k] for k in ("v", "i", "p", "e", "al", "st")},
            CIRCUIT_B: {k: pb[k] for k in ("v", "i", "p", "e", "al", "st")},
        }

        stats_outer = ttk.LabelFrame(tab_mon, text="Averages & statistics", padding=(8, 6))
        stats_outer.grid(row=1, column=0, columnspan=2, sticky="nsew", padx=2, pady=(4, 2))
        self._build_stats_panel(stats_outer)

        tab_hist = ttk.Frame(self.main_nb)
        self.main_nb.add(tab_hist, text="History")
        hist_bar = ttk.Frame(tab_hist, padding=(6, 4))
        hist_bar.pack(fill=tk.X)
        ttk.Label(hist_bar, text="Plot").pack(side=tk.LEFT)
        self.cb_hist_circuit = ttk.Combobox(
            hist_bar, width=8, state="readonly", values=("A", "B", "Both", "All (combined)")
        )
        self.cb_hist_circuit.set("A")
        self.cb_hist_circuit.pack(side=tk.LEFT, padx=(6, 0))
        self.cb_hist_circuit.bind("<<ComboboxSelected>>", lambda _e: self._on_hist_circuit_selected())
        self._hist_nb = ttk.Notebook(tab_hist)
        self._hist_nb.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        self._hist_nb.bind("<<NotebookTabChanged>>", self._on_hist_tab_changed)
        self._hist_chart_meta: list[dict] = []
        self._build_history_period_tabs()

        tab_live = ttk.Frame(self.main_nb)
        self.main_nb.add(tab_live, text="Live graph")
        self._build_live_graph_tab(tab_live)

        tab_ev = ttk.Frame(self.main_nb)
        self.main_nb.add(tab_ev, text="Event log")
        self._build_event_log_tab(tab_ev)

        self._reset_session_stats()

        self._hist_auto_after: str | None = None
        self._hist_last_refresh = 0.0
        self._hist_min_refresh_s = 5.0

        self.refresh_ports()
        self.after(50, self.pump_queue)
        self.after(250, self._refresh_db_stats)
        self.after(30000, self._tick_db_stats)
        self.after(1500, self._tick_system_indicators)

    def _port_for(self, circuit: str) -> str:
        return (
            self.cb_port_a.get().strip()
            if circuit == CIRCUIT_A
            else self.cb_port_b.get().strip()
        )

    def _reader_port(self, circuit: str) -> str:
        """COM used to start the Modbus thread (Circuit B ignored if same as A — one USB adapter)."""
        p = self._port_for(circuit)
        if not p:
            return ""
        if circuit == CIRCUIT_B and p == self._port_for(CIRCUIT_A) and self._port_for(CIRCUIT_A):
            return ""
        return p

    def _warn_duplicate_com(self) -> None:
        pa, pb = self._port_for(CIRCUIT_A), self._port_for(CIRCUIT_B)
        if pa and pb and pa == pb:
            try:
                self._circ_lbl[CIRCUIT_B]["st"].configure(
                    text=f"Circuit B is the same COM as A ({pa}) — only A is polled. Clear B’s COM or plug a 2nd USB–RS485 adapter."
                )
            except tk.TclError:
                pass

    def _readers_ok(self) -> bool:
        """True when every configured COM has a live reader thread."""
        configured = [c for c in CIRCUITS if self._reader_port(c)]
        if not configured:
            # Without this, an empty A/B COM would vacuously return True and skip _start_readers forever.
            return False
        for c in configured:
            r = self._readers.get(c)
            if r is None or not r.is_alive():
                return False
        return True

    def _auto_start_reader(self) -> None:
        """Begin Modbus polling without a Start button; retry if COM port not ready."""
        if self._readers_ok():
            return
        if self._start_readers(quiet=True):
            return
        self.after(3000, self._auto_start_reader)

    def _on_close_window(self) -> None:
        self._app_closing = True
        for c in CIRCUITS:
            aid = self._reader_reconnect_after.get(c)
            if aid is not None:
                try:
                    self.after_cancel(aid)
                except tk.TclError:
                    pass
                self._reader_reconnect_after[c] = None
        try:
            self.stop_reader()
        finally:
            self.destroy()

    def _schedule_reader_reconnect(self, circuit: str, reason: str) -> None:
        if self._app_closing:
            return
        if self._reader_reconnect_after.get(circuit) is not None:
            return
        try:
            self._circ_lbl[circuit]["st"].configure(text=reason)
        except tk.TclError:
            pass

        def go(cid: str = circuit) -> None:
            self._reader_reconnect_after[cid] = None
            if self._app_closing:
                return
            try:
                if not self.winfo_exists():
                    return
            except tk.TclError:
                return
            self._auto_start_reader()

        self._reader_reconnect_after[circuit] = self.after(400, go)

    def _build_event_log_tab(self, parent: ttk.Frame) -> None:
        bar = ttk.Frame(parent, padding=(4, 4))
        bar.pack(fill=tk.X)
        ttk.Button(bar, text="Refresh", command=self._refresh_event_log_view).pack(side=tk.LEFT)
        ttk.Label(
            bar,
            text="Newest first · same SQLite file as readings (requires logging enabled for new rows)",
            font=("Segoe UI", 8),
            foreground="#555",
        ).pack(side=tk.LEFT, padx=(12, 0))
        self.txt_events = scrolledtext.ScrolledText(
            parent,
            height=22,
            font=("Consolas", 9),
            wrap=tk.WORD,
            state=tk.DISABLED,
        )
        self.txt_events.pack(fill=tk.BOTH, expand=True, padx=6, pady=(0, 6))

    def _event_log_set_text(self, s: str) -> None:
        if not hasattr(self, "txt_events"):
            return
        self.txt_events.configure(state=tk.NORMAL)
        self.txt_events.delete("1.0", tk.END)
        self.txt_events.insert("1.0", s)
        self.txt_events.configure(state=tk.DISABLED)

    def _refresh_event_log_view(self) -> None:
        path = Path(self.ent_db_path.get().strip() or str(default_readings_db_path()))
        if not path.is_file():
            self._event_log_set_text("No database file yet.\n\nStart monitoring with SQLite logging enabled to record events.")
            return
        try:
            conn = open_readings_db(path)
            try:
                rows = conn.execute(
                    "SELECT ts, kind, message FROM event_log ORDER BY id DESC LIMIT 800"
                ).fetchall()
            finally:
                conn.close()
        except sqlite3.Error as e:
            self._event_log_set_text(f"Could not read event_log: {e}\n")
            return
        if not rows:
            self._event_log_set_text(
                "No rows in event_log yet.\n\n"
                "Events: start after 3 consecutive readings over 5 V (after cooldown from prior day_end); "
                "end after sustained low P+I (~2 min by default, tuned for clouds); peak in that window."
            )
            return
        lines = []
        for ts, kind, msg in rows:
            tstr = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(float(ts)))
            lines.append(f"{tstr}  [{kind}]  {msg}")
        self._event_log_set_text("\n".join(lines))

    def _maybe_refresh_event_tab(self) -> None:
        try:
            if self.main_nb.index(self.main_nb.select()) == 3:
                self._refresh_event_log_view()
        except tk.TclError:
            pass

    def _insert_app_event(self, ts: float, kind: str, message: str, value: float | None = None) -> None:
        if not bool(self.var_log_db.get()):
            return
        path = Path(self.ent_db_path.get().strip() or str(default_readings_db_path()))
        try:
            conn = open_readings_db(path)
            try:
                conn.execute(
                    "INSERT INTO event_log (ts, kind, message, value) VALUES (?, ?, ?, ?)",
                    (ts, kind, message, value),
                )
            finally:
                conn.close()
        except Exception:
            return
        self.after(0, self._maybe_refresh_event_tab)

    def _tick_system_indicators(self) -> None:
        """Log laptop battery/AC and Wi‑Fi state changes (good hints Ecoflows stopped discharging)."""
        try:
            p = _windows_power_status()
            if p is not None and p != self._sys_last_power:
                self._sys_last_power = p
                pct = p.get("pct", None)
                if pct is None:
                    msg = f"Laptop power: {p.get('ac','unknown')}"
                else:
                    msg = f"Laptop power: {p.get('ac','unknown')}  battery {pct}%"
                self._insert_app_event(time.time(), "laptop_power", msg, float(pct) if pct is not None else None)

            w = _windows_wifi_status()
            if w is not None and w != self._sys_last_wifi:
                self._sys_last_wifi = w
                if w.get("connected"):
                    ssid = w.get("ssid") or "?"
                    sig = w.get("signal")
                    if sig is None:
                        msg = f"Wi‑Fi connected: {ssid}"
                    else:
                        msg = f"Wi‑Fi connected: {ssid}  signal {sig}%"
                    self._insert_app_event(time.time(), "wifi", msg, float(sig) if sig is not None else None)
                else:
                    self._insert_app_event(time.time(), "wifi", "Wi‑Fi disconnected", None)
        finally:
            self.after(30000, self._tick_system_indicators)

    def _emit_day_end_event(self, circuit: str, wall_ts: float, detail: str) -> None:
        """End current production day (after day_start); clears until next 3× V > DAY_START_VOLTAGE_V."""
        if not bool(self.var_log_db.get()):
            return
        st = self._circ_day[circuit]
        if not st["in_production_day"]:
            return
        peak = st["peak_w_today"] if st["peak_w_today"] != float("-inf") else 0.0
        self._insert_app_event(
            wall_ts,
            "day_end",
            f"[{circuit}] End of production day — peak power {peak:.1f} W — {detail}",
            peak,
        )
        st["in_production_day"] = False
        st["high_v_streak"] = 0
        st["low_power_since_wall"] = None
        st["next_day_start_allowed_ts"] = wall_ts + DAY_START_COOLDOWN_AFTER_DAY_END_S

    def _try_emit_day_end_quiet_production(
        self, circuit: str, wall_ts: float, v: float, p: float, i: float
    ) -> None:
        """End of day when P and I stay negligible together (clouds usually still show some I or recover quickly)."""
        st = self._circ_day[circuit]
        if not st["in_production_day"]:
            return
        quiet = p < DAY_END_LOW_POWER_W and i < DAY_END_LOW_CURRENT_A
        if quiet:
            if st["low_power_since_wall"] is None:
                st["low_power_since_wall"] = wall_ts
            elif wall_ts - st["low_power_since_wall"] >= DAY_END_QUIET_S:
                self._emit_day_end_event(
                    circuit,
                    wall_ts,
                    f"no meaningful production for {DAY_END_QUIET_S:.0f}s "
                    f"(P<{DAY_END_LOW_POWER_W} W and I<{DAY_END_LOW_CURRENT_A} A; "
                    f"last V={v:.2f} V, I={i:.2f} A, P={p:.1f} W — Voc can remain after sunset)",
                )
        else:
            st["low_power_since_wall"] = None

    def _record_calendar_peak_events(
        self, circuit: str, wall_ts: float, voltage_v: float, current_a: float, power_w: float
    ) -> None:
        """day_start = 3 consecutive V > 5 V; day_end = sustained quiet P+I; peak_power during production."""
        if not bool(self.var_log_db.get()):
            return
        st = self._circ_day[circuit]
        lt = time.localtime(wall_ts)
        today = date(lt.tm_year, lt.tm_mon, lt.tm_mday)

        if not st["in_production_day"]:
            if st["next_day_start_allowed_ts"] is not None and wall_ts < st["next_day_start_allowed_ts"]:
                st["high_v_streak"] = 0
                return
            if voltage_v > DAY_START_VOLTAGE_V:
                st["high_v_streak"] += 1
                if st["high_v_streak"] >= DAY_START_CONSECUTIVE:
                    st["in_production_day"] = True
                    st["high_v_streak"] = 0
                    st["peak_w_today"] = power_w
                    st["low_power_since_wall"] = None
                    self._insert_app_event(
                        wall_ts,
                        "day_start",
                        f"[{circuit}] Start of day — {DAY_START_CONSECUTIVE} consecutive readings over "
                        f"{DAY_START_VOLTAGE_V} V (local {today.isoformat()}, last reading V={voltage_v:.2f} V)",
                        voltage_v,
                    )
                    return
            else:
                st["high_v_streak"] = 0
            return

        if power_w > st["peak_w_today"]:
            prev = st["peak_w_today"]
            st["peak_w_today"] = power_w
            self._insert_app_event(
                wall_ts,
                "peak_power",
                f"[{circuit}] Highest wattage this production day ({today.isoformat()}) so far: "
                f"{power_w:.1f} W (was {prev:.1f} W)",
                power_w,
            )

        self._try_emit_day_end_quiet_production(circuit, wall_ts, voltage_v, power_w, current_a)

    def _browse_db(self) -> None:
        p = filedialog.asksaveasfilename(
            title="SQLite database file",
            defaultextension=".db",
            filetypes=[("SQLite database", "*.db"), ("All files", "*.*")],
            initialfile=Path(self.ent_db_path.get() or default_readings_db_path()).name,
        )
        if p:
            self.ent_db_path.delete(0, tk.END)
            self.ent_db_path.insert(0, p)

    def _reset_session_stats(self) -> None:
        self._sess: dict[str, dict] = {
            c: {
                "n": 0,
                "sv": 0.0,
                "si": 0.0,
                "sp": 0.0,
                "vmin": float("inf"),
                "vmax": float("-inf"),
                "imin": float("inf"),
                "imax": float("-inf"),
                "pmin": float("inf"),
                "pmax": float("-inf"),
                "e_first": None,
                "e_last": None,
            }
            for c in CIRCUITS
        }
        self._sess_t0 = time.time()

    def _accum_session(self, circuit: str, d: dict) -> None:
        s = self._sess[circuit]
        s["n"] += 1
        v, i, p = float(d["voltage_v"]), float(d["current_a"]), float(d["power_w"])
        e = float(d["energy_kwh"])
        s["sv"] += v
        s["si"] += i
        s["sp"] += p
        s["vmin"] = min(s["vmin"], v)
        s["vmax"] = max(s["vmax"], v)
        s["imin"] = min(s["imin"], i)
        s["imax"] = max(s["imax"], i)
        s["pmin"] = min(s["pmin"], p)
        s["pmax"] = max(s["pmax"], p)
        if s["e_first"] is None:
            s["e_first"] = e
        s["e_last"] = e

    def _fmt_row_stats(self, row: tuple | None) -> str:
        if not row or row[0] == 0:
            return "no data"
        n, av, ai, ap, vmin, vmax, imin, imax, pmin, pmax, emin, emax = row
        n = int(n)
        dv = (float(emax) - float(emin)) if emax is not None and emin is not None else 0.0
        return (
            f"n={n}  V̄={float(av):.2f} (min {float(vmin):.2f} max {float(vmax):.2f})  "
            f"Ī={float(ai):.2f} (min {float(imin):.2f} max {float(imax):.2f})  "
            f"P̄={float(ap):.1f} (min {float(pmin):.1f} max {float(pmax):.1f})  "
            f"ΔkWh≈{dv:.3f}"
        )

    def _build_stats_panel(self, parent: ttk.Frame) -> None:
        wrap = ttk.Frame(parent)
        wrap.pack(fill=tk.BOTH, expand=True)
        self.lbl_sess_a = ttk.Label(wrap, text="Session A: —", font=self._small, justify=tk.LEFT)
        self.lbl_sess_a.pack(anchor=tk.W, pady=1)
        self.lbl_sess_b = ttk.Label(wrap, text="Session B: —", font=self._small, justify=tk.LEFT)
        self.lbl_sess_b.pack(anchor=tk.W, pady=1)
        self._db_lbls: dict[str, ttk.Label] = {}
        periods = [
            ("1 h", 3600.0),
            ("24 h", 86400.0),
            ("7 d", 7 * 86400.0),
            ("48 h", 48 * 3600.0),
            ("30 d", 30 * 86400.0),
            ("365 d", 365 * 86400.0),
        ]
        for name, _sec in periods:
            lb = ttk.Label(
                wrap,
                text=f"DB {name}:  A —  |  B —",
                font=self._small,
                justify=tk.LEFT,
            )
            lb.pack(anchor=tk.W, pady=1)
            self._db_lbls[name] = lb
        ttk.Label(
            wrap,
            text="DB stats: same SQLite file; rows tagged circuit A or B. “All” = legacy + combined queries.",
            font=("Segoe UI", 8),
            foreground="#666",
        ).pack(anchor=tk.W, pady=(6, 0))

    def _update_session_label(self) -> None:
        dt = max(1e-6, time.time() - self._sess_t0)

        def _one(circuit: str, lbl: ttk.Label) -> None:
            s = self._sess[circuit]
            if s["n"] == 0:
                lbl.configure(text=f"Session {circuit}: start monitoring to accumulate averages")
                return
            n = s["n"]
            dv = 0.0
            if s["e_first"] is not None and s["e_last"] is not None:
                dv = float(s["e_last"]) - float(s["e_first"])
            lbl.configure(
                text=(
                    f"Session {circuit} ({dt/60:.1f} min): n={n}  V̄={s['sv']/n:.2f}  Ī={s['si']/n:.2f}  "
                    f"P̄={s['sp']/n:.1f}  "
                    f"V [{s['vmin']:.2f},{s['vmax']:.2f}]  "
                    f"I [{s['imin']:.2f},{s['imax']:.2f}]  "
                    f"P [{s['pmin']:.1f},{s['pmax']:.1f}]  "
                    f"ΔkWh≈{dv:.3f}"
                )
            )

        _one(CIRCUIT_A, self.lbl_sess_a)
        _one(CIRCUIT_B, self.lbl_sess_b)

    def _refresh_db_stats(self) -> None:
        path = Path(self.ent_db_path.get().strip() or str(default_readings_db_path()))
        now = time.time()
        periods = [
            ("1 h", 3600.0),
            ("24 h", 86400.0),
            ("7 d", 7 * 86400.0),
            ("48 h", 48 * 3600.0),
            ("30 d", 30 * 86400.0),
            ("365 d", 365 * 86400.0),
        ]
        for name, sec in periods:
            row_a = db_range_stats(path, now - sec, CIRCUIT_A)
            row_b = db_range_stats(path, now - sec, CIRCUIT_B)
            lb = self._db_lbls[name]
            lb.configure(
                text=(
                    f"DB {name}:  A: {self._fmt_row_stats(row_a)}  |  "
                    f"B: {self._fmt_row_stats(row_b)}"
                )
            )

    def _tick_db_stats(self) -> None:
        self._refresh_db_stats()
        self.after(30000, self._tick_db_stats)

    def _build_history_period_tabs(self) -> None:
        if Figure is None or FigureCanvasTkAgg is None or mdates is None:
            ttk.Label(self._hist_nb, text="Install matplotlib for history charts.", padding=12).pack()
            return
        specs = [
            ("Last hour", 3600, 60),
            ("Last 8 hours", 8 * 3600, 120),
            ("Last 12 hours", 12 * 3600, 180),
            ("Last 24 hours", 24 * 3600, 300),
            ("Last 48 hours", 48 * 3600, 600),
            ("Last week", 7 * 86400, 3600),
            ("Last month", 30 * 86400, 6 * 3600),
            ("Past year", 365 * 86400, 86400),
        ]
        for title, span_sec, bucket in specs:
            fr = ttk.Frame(self._hist_nb)
            self._hist_nb.add(fr, text=title)
            fig = Figure(figsize=(9, 6.5), dpi=100, facecolor="white")
            ax_v, ax_i, ax_p = fig.subplots(3, 1, sharex=True)
            fig.subplots_adjust(left=0.11, right=0.98, top=0.96, bottom=0.22, hspace=0.32)
            lines_a: list = []
            lines_b: list = []
            for ax, ylab, c_a, c_b in zip(
                (ax_v, ax_i, ax_p),
                ("Voltage (V)", "Current (A)", "Power (W)"),
                ("#1f77b4", "#ff7f0e", "#2ca02c"),
                ("#9467bd", "#8c564b", "#17becf"),
            ):
                ax.plot([], [], color=c_a, linewidth=1.2, label="A")
                ax.plot([], [], color=c_b, linewidth=1.2, linestyle="--", label="B")
                lines_a.append(ax.lines[-2])
                lines_b.append(ax.lines[-1])
                ax.set_ylabel(ylab, fontsize=9)
                ax.grid(True, alpha=0.35)
                ax.tick_params(labelsize=8)
            try:
                ax_v.legend(loc="upper right", fontsize=7)
            except Exception:
                pass
            ax_p.set_xlabel("Time (local)", fontsize=9)
            for ax in (ax_v, ax_i, ax_p):
                ax.tick_params(axis="x", which="major", labelsize=8)
            canvas = FigureCanvasTkAgg(fig, master=fr)
            canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
            meta = {
                "title": title,
                "span_sec": span_sec,
                "bucket": bucket,
                "fig": fig,
                "axes": (ax_v, ax_i, ax_p),
                "lines_a": lines_a,
                "lines_b": lines_b,
                "canvas": canvas,
                "tk": canvas.get_tk_widget(),
                "dirty": True,
            }
            self._hist_chart_meta.append(meta)
            canvas.get_tk_widget().bind("<Configure>", lambda e, m=meta: self._schedule_hist_resize(m, e))

    def _build_live_graph_tab(self, parent: ttk.Frame) -> None:
        outer = ttk.Frame(parent, padding=(6, 6))
        outer.pack(fill=tk.BOTH, expand=True)

        bar = ttk.Frame(outer)
        bar.pack(fill=tk.X, side=tk.TOP)
        ttk.Label(bar, text="Window (minutes)").pack(side=tk.LEFT)
        self.sp_live_min = ttk.Spinbox(bar, from_=1, to=120, width=5)
        self.sp_live_min.delete(0, tk.END)
        self.sp_live_min.insert(0, "10")
        self.sp_live_min.pack(side=tk.LEFT, padx=(6, 12))
        ttk.Label(bar, text="(updates while running)").pack(side=tk.LEFT)

        if Figure is None or FigureCanvasTkAgg is None or mdates is None:
            ttk.Label(outer, text="Install matplotlib for live graph.", padding=12).pack()
            self._live_enabled = False
            return

        self._live_enabled = True
        self._live: dict[str, dict[str, deque[float]]] = {
            c: {
                "t": deque(maxlen=60000),
                "v": deque(maxlen=60000),
                "i": deque(maxlen=60000),
                "p": deque(maxlen=60000),
            }
            for c in CIRCUITS
        }
        self._live_dirty = True
        self._live_last_draw = 0.0
        self._live_min_draw_s = 0.25

        fig = Figure(figsize=(9, 6.5), dpi=100, facecolor="white")
        ax_v, ax_i, ax_p = fig.subplots(3, 1, sharex=True)
        fig.subplots_adjust(left=0.11, right=0.98, top=0.96, bottom=0.22, hspace=0.32)
        lines_a: list = []
        lines_b: list = []
        for ax, ylab, c_a, c_b in zip(
            (ax_v, ax_i, ax_p),
            ("Voltage (V)", "Current (A)", "Power (W)"),
            ("#1f77b4", "#ff7f0e", "#2ca02c"),
            ("#9467bd", "#8c564b", "#17becf"),
        ):
            (ln_a,) = ax.plot([], [], color=c_a, linewidth=1.0, label="A")
            (ln_b,) = ax.plot([], [], color=c_b, linewidth=1.0, linestyle="--", label="B")
            lines_a.append(ln_a)
            lines_b.append(ln_b)
            ax.set_ylabel(ylab, fontsize=9)
            ax.grid(True, alpha=0.35)
            ax.tick_params(labelsize=8)
        try:
            ax_v.legend(loc="upper right", fontsize=7)
        except Exception:
            pass
        ax_p.set_xlabel("Time (local)", fontsize=9)
        ax_v.tick_params(axis="x", labelbottom=False)
        ax_i.tick_params(axis="x", labelbottom=False)

        canvas = FigureCanvasTkAgg(fig, master=outer)
        canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True, pady=(6, 0))

        self._live_meta = {
            "fig": fig,
            "axes": (ax_v, ax_i, ax_p),
            "lines_a": lines_a,
            "lines_b": lines_b,
            "canvas": canvas,
        }
        canvas.get_tk_widget().bind("<Configure>", lambda e: self._on_live_configure(e))
        self.after(250, self._tick_live_graph)

    def _on_live_configure(self, event: object) -> None:
        if not getattr(self, "_live_enabled", False):
            return
        try:
            w = int(getattr(event, "width", 0))
            h = int(getattr(event, "height", 0))
        except (TypeError, ValueError):
            return
        if w < 100 or h < 100:
            return
        try:
            dpi = float(self._live_meta["fig"].get_dpi())
            self._live_meta["fig"].set_size_inches(max(4.0, w / dpi), max(3.5, h / dpi))
            self._live_dirty = True
        except Exception:
            pass

    def _append_live_point(self, msg: dict, d: dict, circuit: str) -> None:
        if not getattr(self, "_live_enabled", False):
            return
        buf = self._live[circuit]
        ts = msg.get("wall_ts")
        if ts is None:
            ts = time.time()
        try:
            tsf = float(ts)
        except (TypeError, ValueError):
            tsf = time.time()
        if buf["t"] and tsf <= buf["t"][-1]:
            tsf = buf["t"][-1] + 1e-3
        buf["t"].append(tsf)
        buf["v"].append(float(d["voltage_v"]))
        buf["i"].append(float(d["current_a"]))
        buf["p"].append(float(d["power_w"]))
        self._live_dirty = True

    def _set_measurement_connecting(self, circuit: str | None = None) -> None:
        """Reader restarted but no Modbus frame yet."""
        targets = list(CIRCUITS) if circuit is None else [circuit]
        try:
            for c in targets:
                lb = self._circ_lbl[c]
                lb["v"].configure(text="… V")
                lb["i"].configure(text="… A")
                lb["p"].configure(text="… W")
                lb["e"].configure(text="… kWh")
                lb["al"].configure(text="Alarms: —")
                lb["st"].configure(text="Connecting — waiting for first good Modbus sample…")
        except tk.TclError:
            pass

    def _check_reader_thread(self) -> None:
        """If a serial thread died without a queue message, clear state and reconnect."""
        for cid in CIRCUITS:
            r = self._readers.get(cid)
            if r and not r.is_alive():
                self._readers[cid] = None
                if not self._app_closing:
                    self._schedule_reader_reconnect(cid, f"Circuit {cid}: reader ended — reconnecting…")

    def _tick_live_graph(self) -> None:
        try:
            idx = self.main_nb.index(self.main_nb.select())
        except tk.TclError:
            self.after(300, self._tick_live_graph)
            return

        # Only repaint aggressively when the Live tab is visible.
        if idx == 2 and getattr(self, "_live_enabled", False):
            if self._live_dirty and (time.time() - self._live_last_draw) >= self._live_min_draw_s:
                self._draw_live_graph()
        self.after(250, self._tick_live_graph)

    def _draw_live_graph(self) -> None:
        if not getattr(self, "_live_enabled", False) or Figure is None or mdates is None:
            return
        ax_v, ax_i, ax_p = self._live_meta["axes"]
        la0, la1, la2 = self._live_meta["lines_a"]
        lb0, lb1, lb2 = self._live_meta["lines_b"]

        try:
            win_min = float(self.sp_live_min.get())
        except (ValueError, tk.TclError):
            win_min = 10.0
        win_s = max(30.0, min(7200.0, win_min * 60.0))

        def _series_for(circuit: str) -> tuple[list[float], list[float], list[float], list[float]]:
            buf = self._live[circuit]
            tt = list(buf["t"])
            if not tt:
                return [], [], [], []
            t_end = tt[-1]
            t_cut = t_end - win_s
            xs, vv, ii, pp = [], [], [], []
            for t, v, i, p in zip(tt, list(buf["v"]), list(buf["i"]), list(buf["p"])):
                if t < t_cut:
                    continue
                xs.append(mdates.date2num(datetime.fromtimestamp(t)))
                vv.append(v)
                ii.append(i)
                pp.append(p)
            if not xs and tt:
                xs = [mdates.date2num(datetime.fromtimestamp(t_end))]
                vv = [float(buf["v"][-1])]
                ii = [float(buf["i"][-1])]
                pp = [float(buf["p"][-1])]
            return xs, vv, ii, pp

        xa, va, ia, pa = _series_for(CIRCUIT_A)
        xb, vb, ib, pb = _series_for(CIRCUIT_B)
        xs_union = xa + xb

        if not xs_union:
            now = time.time()
            x0 = mdates.date2num(datetime.fromtimestamp(now - win_s))
            x1 = mdates.date2num(datetime.fromtimestamp(now))
            for ln in (la0, la1, la2, lb0, lb1, lb2):
                ln.set_data([], [])
            for ax in (ax_v, ax_i, ax_p):
                ax.set_xlim(x0, x1)
                ax.set_ylim(0, 1)
            self._apply_history_xaxis(self._live_meta["fig"], ax_p, ax_v, ax_i, x0, x1)
            self._live_meta["canvas"].draw()
            self._live_last_draw = time.time()
            self._live_dirty = False
            return

        la0.set_data(xa, va)
        la1.set_data(xa, ia)
        la2.set_data(xa, pa)
        lb0.set_data(xb, vb)
        lb1.set_data(xb, ib)
        lb2.set_data(xb, pb)

        span = max(xs_union) - min(xs_union)
        if span < 1e-9:
            day_half = max(win_s / 86400.0 * 0.5, 1.0 / 1440.0)
            xmid = xs_union[0]
            x_lo, x_hi = xmid - day_half, xmid + day_half
        else:
            pad = max(1e-6, span * 0.02)
            x_lo, x_hi = min(xs_union) - pad, max(xs_union) + pad
        for ax in (ax_v, ax_i, ax_p):
            ax.set_xlim(x_lo, x_hi)

        def _ylim(ax: object, y_sets: list[list[float]]) -> None:
            flat = [y for ys in y_sets for y in ys if ys]
            if not flat:
                ax.set_ylim(0, 1)
                return
            lo, hi = min(flat), max(flat)
            py = (hi - lo) * 0.08 + 1e-9
            if lo == hi:
                py = max(abs(lo) * 0.05, 0.01)
            ax.set_ylim(lo - py, hi + py)

        _ylim(ax_v, [va, vb])
        _ylim(ax_i, [ia, ib])
        _ylim(ax_p, [pa, pb])

        self._apply_history_xaxis(self._live_meta["fig"], ax_p, ax_v, ax_i, x_lo, x_hi)
        self._live_meta["canvas"].draw()
        self._live_last_draw = time.time()
        self._live_dirty = False

    def _schedule_hist_resize(self, meta: dict, event: object) -> None:
        if Figure is None:
            return
        try:
            w = int(getattr(event, "width", 0))
            h = int(getattr(event, "height", 0))
        except (TypeError, ValueError):
            return
        if w < 100 or h < 100:
            return

        def apply() -> None:
            try:
                dpi = float(meta["fig"].get_dpi())
                meta["fig"].set_size_inches(max(4.0, w / dpi), max(3.5, h / dpi))
                meta["dirty"] = True
                self._draw_history_chart(meta)
            except Exception:
                pass

        self.after(150, apply)

    def _on_main_tab_changed(self, _e: object | None = None) -> None:
        try:
            idx = self.main_nb.index(self.main_nb.select())
        except tk.TclError:
            return
        if idx == 0:
            self._refresh_db_stats()
            self._update_session_label()
        elif idx == 1 and self._hist_chart_meta:
            # Child notebook may report real size only after the tab is mapped; redraw shortly after.
            self.after(80, self._on_hist_tab_changed)
        elif idx == 2:
            if getattr(self, "_live_enabled", False):
                self._live_dirty = True
        elif idx == 3:
            self._refresh_event_log_view()

    def _on_hist_tab_changed(self, _e: object | None = None) -> None:
        try:
            i = self._hist_nb.index(self._hist_nb.select())
        except tk.TclError:
            return
        if 0 <= i < len(self._hist_chart_meta):
            self._hist_chart_meta[i]["dirty"] = True
            self._draw_history_chart(self._hist_chart_meta[i])

    def _hist_mode(self) -> str:
        try:
            return str(self.cb_hist_circuit.get())
        except (tk.TclError, AttributeError):
            return CIRCUIT_A

    def _on_hist_circuit_selected(self) -> None:
        for meta in self._hist_chart_meta:
            meta["dirty"] = True
        self._on_hist_tab_changed()

    def _draw_history_chart(self, meta: dict) -> None:
        if Figure is None or mdates is None:
            return
        if not meta.get("dirty", True):
            return
        path = Path(self.ent_db_path.get().strip() or str(default_readings_db_path()))
        now = time.time()
        t0 = now - float(meta["span_sec"])
        bucket = int(meta["bucket"])
        mode = self._hist_mode()
        ax_v, ax_i, ax_p = meta["axes"]
        la0, la1, la2 = meta["lines_a"]
        lb0, lb1, lb2 = meta["lines_b"]
        x_empty0 = mdates.date2num(datetime.fromtimestamp(t0))
        x_empty1 = mdates.date2num(datetime.fromtimestamp(now))

        def _clear_b() -> None:
            for ln in (lb0, lb1, lb2):
                ln.set_data([], [])

        def _clear_a() -> None:
            for ln in (la0, la1, la2):
                ln.set_data([], [])

        def _apply_y(ax: object, y_sets: list[list[float]]) -> None:
            flat: list[float] = []
            for ys in y_sets:
                if ys:
                    flat.extend(ys)
            if not flat:
                ax.set_ylim(0, 1)
                return
            lo, hi = min(flat), max(flat)
            py = (hi - lo) * 0.08 + 1e-9
            if lo == hi:
                py = max(abs(lo) * 0.05, 0.01)
            ax.set_ylim(lo - py, hi + py)

        if mode == "Both":
            da = db_bucketed_series(path, t0, bucket, CIRCUIT_A)
            db = db_bucketed_series(path, t0, bucket, CIRCUIT_B)
            if (not da or not da[0]) and (not db or not db[0]):
                _clear_a()
                _clear_b()
                for ax in (ax_v, ax_i, ax_p):
                    ax.set_xlim(x_empty0, x_empty1)
                    ax.set_ylim(0, 1)
                self._apply_history_xaxis(meta["fig"], ax_p, ax_v, ax_i, x_empty0, x_empty1)
                meta["canvas"].draw()
                self.update_idletasks()
                meta["dirty"] = False
                return
            xs_all: list[float] = []
            if da and da[0]:
                xs_a = [mdates.date2num(datetime.fromtimestamp(t)) for t in da[0]]
                la0.set_data(xs_a, da[1])
                la1.set_data(xs_a, da[2])
                la2.set_data(xs_a, da[3])
                xs_all.extend(xs_a)
            else:
                _clear_a()
            if db and db[0]:
                xs_b = [mdates.date2num(datetime.fromtimestamp(t)) for t in db[0]]
                lb0.set_data(xs_b, db[1])
                lb1.set_data(xs_b, db[2])
                lb2.set_data(xs_b, db[3])
                xs_all.extend(xs_b)
            else:
                _clear_b()
            if not xs_all:
                span_x = x_empty1 - x_empty0
                x_lo, x_hi = x_empty0, x_empty1
            else:
                span = max(xs_all) - min(xs_all)
                if span < 1e-9:
                    day_half = max(float(meta["span_sec"]) / 86400.0 * 0.5, 1.0 / 1440.0)
                    xmid = xs_all[0]
                    x_lo, x_hi = xmid - day_half, xmid + day_half
                else:
                    pad = max(1e-6, span * 0.02)
                    x_lo, x_hi = min(xs_all) - pad, max(xs_all) + pad
            for ax in (ax_v, ax_i, ax_p):
                ax.set_xlim(x_lo, x_hi)
            yv = ([da[1]] if da and da[0] else []) + ([db[1]] if db and db[0] else [])
            yi = ([da[2]] if da and da[0] else []) + ([db[2]] if db and db[0] else [])
            yp = ([da[3]] if da and da[0] else []) + ([db[3]] if db and db[0] else [])
            _apply_y(ax_v, yv)
            _apply_y(ax_i, yi)
            _apply_y(ax_p, yp)
            self._apply_history_xaxis(meta["fig"], ax_p, ax_v, ax_i, x_lo, x_hi)
            meta["canvas"].draw()
            self.update_idletasks()
            meta["dirty"] = False
            return

        circ: str | None
        if mode == "All (combined)":
            circ = None
        elif mode == CIRCUIT_B:
            circ = CIRCUIT_B
        else:
            circ = CIRCUIT_A

        data = db_bucketed_series(path, t0, bucket, circ)
        if not data or not data[0]:
            _clear_a()
            _clear_b()
            for ax in (ax_v, ax_i, ax_p):
                ax.set_xlim(x_empty0, x_empty1)
                ax.set_ylim(0, 1)
            self._apply_history_xaxis(meta["fig"], ax_p, ax_v, ax_i, x_empty0, x_empty1)
            meta["canvas"].draw()
            self.update_idletasks()
            meta["dirty"] = False
            return
        tx, vv, ii, pp = data
        xs = [mdates.date2num(datetime.fromtimestamp(t)) for t in tx]
        la0.set_data(xs, vv)
        la1.set_data(xs, ii)
        la2.set_data(xs, pp)
        _clear_b()
        span = max(xs) - min(xs)
        if span < 1e-9:
            day_half = max(float(meta["span_sec"]) / 86400.0 * 0.5, 1.0 / 1440.0)
            xmid = xs[0]
            x_lo, x_hi = xmid - day_half, xmid + day_half
        else:
            pad = max(1e-6, span * 0.02)
            x_lo, x_hi = min(xs) - pad, max(xs) + pad
        for ax in (ax_v, ax_i, ax_p):
            ax.set_xlim(x_lo, x_hi)
        for ax, y in zip((ax_v, ax_i, ax_p), (vv, ii, pp)):
            lo, hi = min(y), max(y)
            py = (hi - lo) * 0.08 + 1e-9
            if lo == hi:
                py = max(abs(lo) * 0.05, 0.01)
            ax.set_ylim(lo - py, hi + py)
        self._apply_history_xaxis(meta["fig"], ax_p, ax_v, ax_i, x_lo, x_hi)
        meta["canvas"].draw()
        self.update_idletasks()
        meta["dirty"] = False

    def _request_history_refresh(self) -> None:
        # Throttle DB reads; these can be expensive with a large DB.
        now = time.time()
        if (now - self._hist_last_refresh) < self._hist_min_refresh_s:
            return
        self._hist_last_refresh = now
        try:
            idx = self.main_nb.index(self.main_nb.select())
        except tk.TclError:
            return
        if idx != 1:
            return
        self._on_hist_tab_changed()

    def _apply_history_xaxis(
        self,
        fig: Figure,
        ax_p: object,
        ax_v: object,
        ax_i: object,
        x0: float,
        x1: float,
    ) -> None:
        """Set tick locators/formatters so several time labels appear on the shared date axis."""
        if mdates is None:
            return
        span_days = abs(x1 - x0)
        maxticks = 11 if span_days < 3 else 10
        try:
            loc = mdates.AutoDateLocator(
                minticks=5,
                maxticks=maxticks,
                interval_multiples=True,
            )
        except TypeError:
            loc = mdates.AutoDateLocator(minticks=5, maxticks=maxticks)
        ax_p.xaxis.set_major_locator(loc)
        try:
            ax_p.xaxis.set_major_formatter(ConciseDateFormatter(loc, tz=None, show_offset=True))
        except Exception:
            ax_p.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d %H:%M"))
        try:
            ax_p.xaxis.set_minor_locator(mdates.AutoMinorLocator())
        except Exception:
            pass
        ax_v.tick_params(axis="x", labelbottom=False)
        ax_i.tick_params(axis="x", labelbottom=False)
        try:
            fig.autofmt_xdate(rotation=18, ha="right")
        except TypeError:
            fig.autofmt_xdate(rotation=18)

    def refresh_ports(self) -> None:
        ports = [p.device for p in serial.tools.list_ports.comports()]
        self.cb_port_a["values"] = ports
        self.cb_port_b["values"] = ports
        if len(ports) >= 1 and self.cb_port_a.get() not in ports:
            self.cb_port_a.set(ports[0])
        if len(ports) >= 2 and self.cb_port_b.get() not in ports:
            self.cb_port_b.set(ports[1])
        if not ports:
            warn = (
                "No COM ports — plug each USB–RS485 adapter (meter DC power alone does not create a port). "
                "Install CH340 / CP210x / FTDI driver if needed. You can type COMn, then Refresh."
            )
            try:
                for c in CIRCUITS:
                    self._circ_lbl[c]["st"].configure(text=warn)
            except tk.TclError:
                pass
        else:
            self._warn_duplicate_com()
        self.after(100, self._auto_start_reader)

    def _read_shared_cfg_tail(
        self,
    ) -> tuple[int, int, int, float, float, bool, bool, str, int]:
        baud = int(self.cb_baud.get())
        slave = int(self.sp_slave.get())
        stopbits = int(self.cb_stop.get())
        read_timeout_s = max(0.05, float(self.sp_read_ms.get()) / 1000.0)
        poll_delay_s = max(0.0, float(self.sp_delay_ms.get()) / 1000.0)
        discard = bool(self.var_discard.get())
        log_db = bool(self.var_log_db.get())
        db_path = self.ent_db_path.get().strip()
        rts_map = {"Off": 0, "RTS high while TX": 1, "RTS low while TX": 2}
        rs485_rts_mode = rts_map.get(self.cb_rs485_rts.get().strip(), 0)
        return baud, slave, stopbits, read_timeout_s, poll_delay_s, discard, log_db, db_path, rs485_rts_mode

    def _full_cfg(self, circuit: str) -> tuple:
        port = self._port_for(circuit)
        t = self._read_shared_cfg_tail()
        return (port, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8])

    def _start_readers(self, *, quiet: bool = False) -> bool:
        try:
            tail = self._read_shared_cfg_tail()
        except Exception as e:
            if not quiet:
                messagebox.showerror("Settings", str(e))
            else:
                for c in CIRCUITS:
                    try:
                        self._circ_lbl[c]["st"].configure(text=f"Invalid settings: {e}")
                    except tk.TclError:
                        pass
            return False

        baud, slave, stopbits, read_timeout_s, poll_delay_s, discard, log_db, db_path, rs485_rts_mode = tail
        any_configured = False
        started_new = False

        for c in CIRCUITS:
            port = self._reader_port(c)
            raw = self._port_for(c)
            if raw and not port:
                self._warn_duplicate_com()
            if not raw:
                if self._readers.get(c) is not None:
                    try:
                        self.cfg_q[c].put(("stop",))
                    except Exception:
                        pass
                continue
            if not port:
                if self._readers.get(c) is not None:
                    try:
                        self.cfg_q[c].put(("stop",))
                    except Exception:
                        pass
                continue
            any_configured = True
            if self._readers.get(c) is not None and self._readers[c].is_alive():
                continue
            cfg = (port, baud, slave, stopbits, read_timeout_s, poll_delay_s, discard, log_db, db_path, rs485_rts_mode)
            th = ReaderThread(
                self.out_q,
                self.cfg_q[c],
                circuit_id=c,
                port=cfg[0],
                baud=cfg[1],
                slave=cfg[2],
                stopbits=cfg[3],
                read_timeout_s=cfg[4],
                poll_delay_s=cfg[5],
                discard_before_write=cfg[6],
                log_db=cfg[7],
                db_path=cfg[8],
                rs485_rts_mode=cfg[9],
            )
            th.start()
            self._readers[c] = th
            self._set_measurement_connecting(c)
            started_new = True

        if not any_configured:
            if not quiet:
                messagebox.showerror("COM", "Enter at least one COM port (Circuit A and/or B).")
            else:
                for c in CIRCUITS:
                    try:
                        self._circ_lbl[c]["st"].configure(
                            text="Waiting for COM — set Circuit A and/or B above, plug USB–RS485, Refresh."
                        )
                    except tk.TclError:
                        pass
            return False

        if started_new:
            _windows_prevent_sleep(True)
            for c in CIRCUITS:
                aid = self._reader_reconnect_after.get(c)
                if aid is not None:
                    try:
                        self.after_cancel(aid)
                    except tk.TclError:
                        pass
                    self._reader_reconnect_after[c] = None
        return True

    def stop_reader(self) -> None:
        _windows_prevent_sleep(False)
        for c in CIRCUITS:
            if self._readers.get(c) is not None:
                try:
                    self.cfg_q[c].put(("stop",))
                except Exception:
                    pass
            self._readers[c] = None

    def apply_live(self) -> None:
        try:
            tail = self._read_shared_cfg_tail()
        except Exception as e:
            messagebox.showerror("Settings", str(e))
            return
        self._start_readers(quiet=True)
        self._warn_duplicate_com()
        baud, slave, stopbits, read_timeout_s, poll_delay_s, discard, log_db, db_path, rs485_rts_mode = tail
        for c in CIRCUITS:
            port = self._reader_port(c)
            if not port:
                continue
            cfg = (port, baud, slave, stopbits, read_timeout_s, poll_delay_s, discard, log_db, db_path, rs485_rts_mode)
            if self._readers.get(c) is not None and self._readers[c].is_alive():
                self.cfg_q[c].put(("update", cfg))

    def _pump_one_message(self, msg: dict, stats_touch: list[bool], hist_touch: list[bool]) -> None:
        """Handle one reader queue message; mutates stats_touch[0] / hist_touch[0]. Raises only on programmer error."""
        circuit = str(msg.get("circuit", CIRCUIT_A))
        if circuit not in CIRCUITS:
            circuit = CIRCUIT_A
        lb = self._circ_lbl[circuit]
        mtype = msg.get("type")
        if mtype == "sample_ok":
            d = msg["data"]
            self._last_comm_err[circuit] = None
            lb["v"].configure(text=f"{d['voltage_v']:.2f} V")
            lb["i"].configure(text=f"{d['current_a']:.2f} A")
            lb["p"].configure(text=f"{d['power_w']:.1f} W")
            lb["e"].configure(text=f"{d['energy_kwh']:.3f} kWh")
            lb["al"].configure(
                text=f"Alarms: HV={'ON' if d['hv_alarm'] else 'off'}  LV={'ON' if d['lv_alarm'] else 'off'}"
            )
            lb["st"].configure(
                text=f"OK {msg['ok']}  Err {msg['err']}  ~{msg['hz']:.1f} good reads/s  last RTT {msg['dt']*1000:.1f} ms"
            )
            self._accum_session(circuit, d)
            self._append_live_point(msg, d, circuit)
            try:
                wt_ev = float(msg.get("wall_ts", time.time()))
            except (TypeError, ValueError):
                wt_ev = time.time()
            self._record_calendar_peak_events(
                circuit,
                wt_ev,
                float(d["voltage_v"]),
                float(d["current_a"]),
                float(d["power_w"]),
            )
            stats_touch[0] = True
            hist_touch[0] = True
        elif mtype == "sample_err":
            reason = str(msg.get("reason", ""))
            self._last_comm_err[circuit] = reason
            extra = ""
            if reason.startswith("short read"):
                try:
                    rms = float(self.sp_read_ms.get())
                    dt_ms = float(msg.get("dt", 0.0)) * 1000.0
                    if rms > 0 and dt_ms >= rms * 0.85:
                        extra = (
                            f"  — 0 bytes before ~{rms:.0f} ms read timeout. "
                            "If this used to work at low timeout, check COM#, another app on the port, "
                            "RS485 A/B, slave ID, or try a slightly higher timeout."
                        )
                except (ValueError, tk.TclError):
                    pass
            lb["st"].configure(
                text=f"OK {msg['ok']}  Err {msg['err']}  last issue: {reason}  RTT {msg['dt']*1000:.1f} ms{extra}"
            )
        elif mtype == "error":
            lb["st"].configure(text=msg["message"])
        elif mtype == "db_error":
            lb["st"].configure(text=msg["message"])
        elif mtype == "stopped":
            self._readers[circuit] = None
            lb["st"].configure(text="Stopped — restarting reader…")
            stats_touch[0] = True
            if not self._app_closing:
                self._schedule_reader_reconnect(circuit, f"Circuit {circuit}: serial reader stopped — reconnecting…")
        else:
            lb["st"].configure(text=f"Unknown message type: {mtype!r}")

    def pump_queue(self) -> None:
        st = [False]
        ht = [False]
        try:
            while True:
                try:
                    msg = self.out_q.get_nowait()
                except queue.Empty:
                    break
                try:
                    self._pump_one_message(msg, st, ht)
                except tk.TclError:
                    raise
                except Exception as e:
                    err_t = f"UI handler error (readings still polled): {type(e).__name__}: {e}"
                    for c in CIRCUITS:
                        try:
                            self._circ_lbl[c]["st"].configure(text=err_t)
                        except tk.TclError:
                            pass
            for c in CIRCUITS:
                r = self._readers.get(c)
                if r is not None and not r.is_alive() and not self._app_closing:
                    self._readers[c] = None
                    self._schedule_reader_reconnect(c, f"Circuit {c}: reader thread ended — reconnecting…")
            if st[0]:
                self._update_session_label()
            if ht[0]:
                self._request_history_refresh()
            self._check_reader_thread()
        finally:
            if not self._app_closing:
                try:
                    self.after(50, self.pump_queue)
                except tk.TclError:
                    pass


def main() -> None:
    App().mainloop()


if __name__ == "__main__":
    main()
