"""
Exhaustive serial sweep for PZEM-017 Modbus (same FC04 request as the monitor).

  python pzem_serial_sweep.py COM3

Close the monitor / anything else on that COM port first.

Tests every combination of:
  - baud: 9600, 19200, 38400, 57600, 115200
  - stop bits: 1, 2
  - RTS: off / high-while-TX / low-while-TX
  - slave id: 1 .. 8

Reports any run that returns a full 21-byte frame (CRC OK implied by length+hdr check optional).
"""

from __future__ import annotations

import argparse
import itertools
import sys
import time

try:
    import serial
except ImportError:
    print("pip install pyserial", file=sys.stderr)
    raise SystemExit(1)


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


def build_read_input_registers(slave: int, start_addr: int, quantity: int) -> bytes:
    pdu = bytes(
        [slave, 0x04, (start_addr >> 8) & 0xFF, start_addr & 0xFF, (quantity >> 8) & 0xFF, quantity & 0xFF]
    )
    c = crc16_modbus(pdu)
    return pdu + bytes([c & 0xFF, (c >> 8) & 0xFF])


def read_modbus_rtu_n(ser: serial.Serial, nbytes: int, total_timeout_s: float) -> bytes:
    deadline = time.perf_counter() + max(float(total_timeout_s), 0.05)
    buf = b""
    while len(buf) < nbytes and time.perf_counter() < deadline:
        chunk = ser.read(nbytes - len(buf))
        if chunk:
            buf += chunk
    return buf


def tx_rx_once(
    port: str,
    baud: int,
    stopbits: int,
    rts_mode: int,
    slave: int,
    timeout_s: float,
) -> tuple[int, bytes, float]:
    sb = serial.STOPBITS_TWO if stopbits == 2 else serial.STOPBITS_ONE
    ser = serial.Serial(
        port=port,
        baudrate=baud,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=sb,
        timeout=timeout_s,
        write_timeout=timeout_s,
    )
    try:
        try:
            ser.reset_input_buffer()
        except Exception:
            pass
        req = build_read_input_registers(slave, 0x0000, 8)
        t0 = time.perf_counter()
        try:
            if rts_mode == 1:
                ser.rts = True
            elif rts_mode == 2:
                ser.rts = False
        except Exception:
            pass
        ser.write(req)
        try:
            ser.flush()
        except Exception:
            pass
        try:
            if rts_mode == 1:
                ser.rts = False
            elif rts_mode == 2:
                ser.rts = True
        except Exception:
            pass
        char_s = 11.0 / float(max(baud, 300))
        time.sleep(max(0.015, 1.5 * char_s))
        payload = read_modbus_rtu_n(ser, 21, timeout_s)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        return len(payload), payload, dt_ms
    finally:
        try:
            ser.close()
        except Exception:
            pass


def crc_ok_21(frame: bytes) -> bool:
    if len(frame) != 21:
        return False
    return crc16_modbus(frame[:-2]) == (frame[-2] | (frame[-1] << 8))


def main() -> None:
    ap = argparse.ArgumentParser(description="Sweep PZEM-017 serial parameter combinations")
    ap.add_argument("port", help="e.g. COM3")
    ap.add_argument(
        "--bauds",
        default="9600,19200,38400,57600,115200",
        help="Comma-separated baud list",
    )
    ap.add_argument("--slaves", type=str, default="1,2,3,4,5,6,7,8", help="Comma-separated slave ids")
    ap.add_argument("--timeout", type=float, default=0.7, help="Per-read timeout (s); sweep uses many trials")
    ap.add_argument("--quiet", action="store_true", help="Only print hits and summary")
    args = ap.parse_args()

    bauds = [int(x.strip()) for x in args.bauds.split(",") if x.strip()]
    slaves = [int(x.strip()) for x in args.slaves.split(",") if x.strip()]
    stops = (1, 2)
    rts_modes = (0, 1, 2)
    rts_names = {0: "RTS off", 1: "RTS hi TX", 2: "RTS lo TX"}

    combos = list(itertools.product(bauds, stops, rts_modes, slaves))
    total = len(combos)
    hits: list[tuple] = []
    rx_nonempty = 0
    partial = 0

    print(f"Port {args.port} - {total} combinations (close other apps using this COM).", flush=True)
    print(f"Timeout {args.timeout}s per try.\n", flush=True)

    for i, (baud, stop, rts_m, slave) in enumerate(combos, start=1):
        try:
            n, payload, dt_ms = tx_rx_once(args.port, baud, stop, rts_m, slave, args.timeout)
        except serial.SerialException as e:
            if not args.quiet:
                print(f"[{i}/{total}] baud={baud} stop={stop} rts={rts_m} slave={slave}  ERROR open: {e}", flush=True)
            continue
        except Exception as e:
            if not args.quiet:
                print(f"[{i}/{total}] baud={baud} stop={stop} rts={rts_m} slave={slave}  ERROR: {e}", flush=True)
            continue

        if n > 0:
            rx_nonempty += 1
        if 0 < n < 21:
            partial += 1

        ok21 = n == 21 and crc_ok_21(payload)
        if ok21:
            hits.append((baud, stop, rts_m, slave, dt_ms, payload.hex()))
            print(
                f"*** HIT [{i}/{total}] baud={baud} stop={stop} {rts_names[rts_m]} slave={slave}  "
                f"{dt_ms:.0f} ms  RX={payload.hex()}",
                flush=True,
            )
        elif not args.quiet and n == 21 and not crc_ok_21(payload):
            print(
                f"[{i}/{total}] 21 bytes but CRC bad  baud={baud} stop={stop} slave={slave}  {payload.hex()[:64]}...",
                flush=True,
            )

    print("\n--- summary ---", flush=True)
    print(f"Tried: {total}", flush=True)
    print(f"Any RX bytes (len>0): {rx_nonempty} tries", flush=True)
    print(f"Partial frames (1..20 bytes): {partial}", flush=True)
    print(f"Valid 21-byte + CRC: {len(hits)}", flush=True)
    if not hits:
        print(
            "No working combo in this sweep. If every try was 0 bytes, the adapter is not receiving "
            "a Modbus reply on this COM (wiring, power to module logic, wrong COM, or dead transceiver).",
            flush=True,
        )
        raise SystemExit(1)


if __name__ == "__main__":
    main()
