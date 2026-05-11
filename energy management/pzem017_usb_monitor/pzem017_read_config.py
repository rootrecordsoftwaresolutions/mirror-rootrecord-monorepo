"""
Read PZEM-017 holding registers (FC 0x03) — alarm thresholds, Modbus address, current range.

Peacefair-style map (register 0x0003 value -> shunt rating the firmware expects):
  0 -> 100 A   1 -> 50 A   2 -> 200 A   3 -> 300 A

If this does not match your physical shunt, current (and therefore power) can be scaled wrong.

  pip install "pymodbus[serial]"
  python pzem017_read_config.py COM3

Close the monitor while running (same COM port).
"""

from __future__ import annotations

import argparse
import sys


def range_label(v: int) -> str:
    m = {0: "100 A", 1: "50 A", 2: "200 A", 3: "300 A"}
    return m.get(v, f"unknown code {v}")


def main() -> None:
    try:
        from pymodbus.client import ModbusSerialClient
    except ImportError:
        print('pip install "pymodbus[serial]"', file=sys.stderr)
        raise SystemExit(2)

    ap = argparse.ArgumentParser(description="PZEM-017: read config (holding regs 0..3)")
    ap.add_argument("port")
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--slave", type=int, default=1)
    ap.add_argument("--stopbits", type=int, default=2, choices=(1, 2))
    ap.add_argument("--timeout", type=float, default=2.0)
    args = ap.parse_args()

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
            rh = client.read_holding_registers(0, count=4, device_id=args.slave)
        except TypeError:
            rh = client.read_holding_registers(0, count=4, slave=args.slave)
        try:
            ri = client.read_input_registers(0, count=8, device_id=args.slave)
        except TypeError:
            ri = client.read_input_registers(0, count=8, slave=args.slave)
    finally:
        client.close()

    if rh.isError():
        print("Holding read error:", rh, file=sys.stderr)
        raise SystemExit(1)
    if ri.isError():
        print("Input read error:", ri, file=sys.stderr)
        raise SystemExit(1)

    h = rh.registers
    # 0x0000 HV alarm V * 0.01, 0x0001 LV alarm V * 0.01, 0x0002 slave addr, 0x0003 range
    print("--- holding (config) ---")
    print(f"  reg 0x0000 high-V alarm threshold: {h[0] / 100.0:.2f} V")
    print(f"  reg 0x0001 low-V  alarm threshold: {h[1] / 100.0:.2f} V")
    print(f"  reg 0x0002 Modbus slave address:    {h[2]}")
    print(f"  reg 0x0003 current range (firmware): {range_label(h[3])}  (raw {h[3]})")

    r = ri.registers
    v = r[0] / 100.0
    i = r[1] / 100.0
    p_lo, p_hi = r[2], r[3]
    p_raw = ((p_hi & 0xFFFF) << 16) | (p_lo & 0xFFFF)
    if p_raw >= 0x80000000:
        p_raw -= 0x100000000
    p = p_raw / 10.0

    print("--- input (live) ---")
    print(f"  voltage: {v:.2f} V")
    print(f"  current: {i:.2f} A")
    print(f"  power (reg): {p:.1f} W")
    print(f"  V*I (check): {v * i:.1f} W")
    if v * i > 1.0:
        ratio = p / (v * i)
        print(f"  power / (V*I): {ratio:.4f}  (expect ~1.0 if meter is self-consistent)")

    print("\nIf EcoFlow shows ~half of P here but V*I matches P above, the PZEM numbers are")
    print("self-consistent — compare V and I with a multimeter at the meter terminals, and")
    print("confirm reg 0x0003 matches your shunt (50/100/200/300 A).")


if __name__ == "__main__":
    main()
