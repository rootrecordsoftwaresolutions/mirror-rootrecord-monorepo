"""
Reference-path probe using pymodbus (same stack as github.com/mar-svo/PZEM-017 test.py).

  pip install "pymodbus[serial]"
  python probe_pymodbus_pzem.py COM3

If this fails with Modbus error / timeout while our raw probe also gets 0 RX bytes,
the problem is not CRC/framing in pzem017_monitor.py — it is port, wiring, adapter,
or PZEM power (see Peacefair doc: RS485 is passive; needs external 5V >100 mA, and
<7 V measured requires separate 5 V via module USB — not PC USB).
"""

from __future__ import annotations

import argparse
import sys


def main() -> None:
    try:
        from pymodbus.client import ModbusSerialClient
    except ImportError:
        print('Install pymodbus with serial extras:  pip install "pymodbus[serial]"', file=sys.stderr)
        raise SystemExit(2)

    ap = argparse.ArgumentParser(description="PZEM-017 read via pymodbus (reference client)")
    ap.add_argument("port", help="e.g. COM3")
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
        print("connect() failed", file=sys.stderr)
        raise SystemExit(1)

    try:
        try:
            rr = client.read_input_registers(0, count=8, device_id=args.slave)
        except TypeError:
            rr = client.read_input_registers(0, count=8, slave=args.slave)
    except Exception as e:
        print(f"No usable reply (same as raw serial probe if wiring/port/power are wrong): {e}", file=sys.stderr)
        raise SystemExit(1)
    finally:
        try:
            client.close()
        except Exception:
            pass

    if rr.isError():
        print(f"Modbus error: {rr}", file=sys.stderr)
        raise SystemExit(1)
    print("OK — registers:", list(rr.registers))


if __name__ == "__main__":
    main()
