"""
One-shot diagnostic: same request as the monitor (FC 0x04, regs 0–7).

  python serial_probe_pzem.py COM3

PZEM-017 factory-style link: 9600 8N2 (see e.g. github.com/mar-svo/PZEM-017).
"""

from __future__ import annotations

import argparse
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


def read_modbus_rtu_n(ser: serial.Serial, nbytes: int, total_timeout_s: float) -> bytes:
    deadline = time.perf_counter() + max(float(total_timeout_s), 0.05)
    buf = b""
    while len(buf) < nbytes and time.perf_counter() < deadline:
        chunk = ser.read(nbytes - len(buf))
        if chunk:
            buf += chunk
    return buf


def build_read_input_registers(slave: int, start_addr: int, quantity: int) -> bytes:
    pdu = bytes(
        [slave, 0x04, (start_addr >> 8) & 0xFF, start_addr & 0xFF, (quantity >> 8) & 0xFF, quantity & 0xFF]
    )
    c = crc16_modbus(pdu)
    return pdu + bytes([c & 0xFF, (c >> 8) & 0xFF])


def main() -> None:
    ap = argparse.ArgumentParser(description="Probe PZEM-017 Modbus on a COM port")
    ap.add_argument("port", help="e.g. COM3")
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--slave", type=int, default=1)
    ap.add_argument("--stopbits", type=int, default=2, choices=(1, 2))
    ap.add_argument("--timeout", type=float, default=1.5, help="Serial read timeout (s)")
    ap.add_argument("--rts", type=int, default=0, choices=(0, 1, 2), help="0=off, 1=high while TX, 2=low while TX")
    args = ap.parse_args()

    sb = serial.STOPBITS_TWO if args.stopbits == 2 else serial.STOPBITS_ONE
    ser = serial.Serial(
        port=args.port,
        baudrate=args.baud,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=sb,
        timeout=args.timeout,
        write_timeout=args.timeout,
    )

    req = build_read_input_registers(args.slave, 0x0000, 8)
    print(f"TX ({len(req)} bytes): {req.hex()}")
    t0 = time.perf_counter()
    try:
        if args.rts == 1:
            ser.rts = True
        elif args.rts == 2:
            ser.rts = False
    except Exception as e:
        print(f"(RTS start skipped: {e})")
    ser.write(req)
    try:
        ser.flush()
    except Exception:
        pass
    try:
        if args.rts == 1:
            ser.rts = False
        elif args.rts == 2:
            ser.rts = True
    except Exception:
        pass
    char_s = 11.0 / float(max(args.baud, 300))
    time.sleep(max(0.015, 1.5 * char_s))
    payload = read_modbus_rtu_n(ser, 21, args.timeout)
    dt = (time.perf_counter() - t0) * 1000.0
    ser.close()

    print(f"RX ({len(payload)} bytes) after {dt:.0f} ms: {payload.hex() if payload else '(none)'}")
    if len(payload) != 21:
        print(
            "\nNo valid 21-byte frame.\n"
            "If RX is 0 bytes, the PC is not receiving a Modbus reply (not a CRC bug in the monitor).\n"
            "Cross-check with:  pip install \"pymodbus[serial]\"   then   python probe_pymodbus_pzem.py PORT\n"
            "PZEM-017: 9600 8N2; try --stopbits 1 if needed; --rts 1/2 for manual DE/RE. Close other apps on this COM."
        )
        raise SystemExit(1)
    print("OK — 21 bytes received.")


if __name__ == "__main__":
    main()
