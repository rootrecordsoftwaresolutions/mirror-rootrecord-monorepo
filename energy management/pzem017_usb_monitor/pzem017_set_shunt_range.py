"""
Write PZEM-017 current-range (holding register 0x0003) via FC 0x06.

Peacefair-style values for register address 0x0003 (holding):
  0 -> 100 A   1 -> 50 A   2 -> 200 A   3 -> 300 A

  pip install "pymodbus[serial]"
  python pzem017_set_shunt_range.py COM3 --range 50

Close the monitor while running.
"""

from __future__ import annotations

import argparse
import sys

RANGE_TO_VALUE = {"50": 1, "100": 0, "200": 2, "300": 3}


def range_label(v: int) -> str:
    m = {0: "100 A", 1: "50 A", 2: "200 A", 3: "300 A"}
    return m.get(v, f"code {v}")


def main() -> None:
    try:
        from pymodbus.client import ModbusSerialClient
    except ImportError:
        print('pip install "pymodbus[serial]"', file=sys.stderr)
        raise SystemExit(2)

    ap = argparse.ArgumentParser(description="PZEM-017: set shunt current range (holding reg 0x0003)")
    ap.add_argument("port")
    ap.add_argument(
        "--range",
        type=str,
        default="50",
        choices=("50", "100", "200", "300"),
        help="Shunt rating the meter should use (default 50)",
    )
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--slave", type=int, default=1)
    ap.add_argument("--stopbits", type=int, default=2, choices=(1, 2))
    ap.add_argument("--timeout", type=float, default=2.0)
    args = ap.parse_args()

    value = RANGE_TO_VALUE[args.range]
    client = ModbusSerialClient(
        port=args.port,
        baudrate=args.baud,
        parity="N",
        stopbits=args.stopbits,
        bytesize=8,
        timeout=args.timeout,
    )
    if not client.connect():
        print("connect failed", file=sys.stderr)
        raise SystemExit(1)

    try:
        try:
            rh0 = client.read_holding_registers(0, count=4, device_id=args.slave)
        except TypeError:
            rh0 = client.read_holding_registers(0, count=4, slave=args.slave)
        if rh0.isError():
            print("read holding (before) error:", rh0, file=sys.stderr)
            raise SystemExit(1)
        before = rh0.registers[3]
        print(f"Before: holding[0x0003] = {before} -> {range_label(before)}")

        try:
            wr = client.write_register(0x0003, value, device_id=args.slave)
        except TypeError:
            wr = client.write_register(0x0003, value, slave=args.slave)
        if wr.isError():
            print("write_register error:", wr, file=sys.stderr)
            raise SystemExit(1)

        try:
            rh1 = client.read_holding_registers(0, count=4, device_id=args.slave)
        except TypeError:
            rh1 = client.read_holding_registers(0, count=4, slave=args.slave)
        if rh1.isError():
            print("read holding (after) error:", rh1, file=sys.stderr)
            raise SystemExit(1)
        after = rh1.registers[3]
        print(f"After:  holding[0x0003] = {after} -> {range_label(after)}")
        if after != value:
            print("WARNING: read-back does not match requested value.", file=sys.stderr)
            raise SystemExit(1)
        print(f"OK — meter set to {args.range} A range.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
