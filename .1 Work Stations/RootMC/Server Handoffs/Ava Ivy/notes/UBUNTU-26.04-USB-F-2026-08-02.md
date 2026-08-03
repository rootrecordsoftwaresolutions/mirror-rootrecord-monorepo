# Ubuntu Server 26.04 installer USB — 2026-08-02

## Result: SUCCESS

Bootable Ubuntu Server **26.04** live-server ISO was raw-written (hybrid DD-style) to the **SanDisk Cruzer Glide** USB Alex authorized for wipe.

### ISO
- Path: `C:\Users\store\Downloads\ubuntu-26.04-live-server-amd64.iso`
- Size: **2,918,598,656** bytes (~2.78 GiB)
- SHA256: `DEC49008A71F6098D0BCFC822021F4D042D5F2DB279E4D75BDD981304F1CA5D9`

### Target disk identity (authoritative — not drive letter)
| Field | Value |
|---|---|
| FriendlyName | SanDisk Cruzer Glide |
| SerialNumber | `04016804051724125459` |
| BusType | USB |
| Size | ~28.7 GiB (30,784,094,208 bytes) |
| Disk number at flash time | **4** (was **3** earlier — numbers drift) |
| Letters after flash | **I:** (ISO volume), **J:** (small), ESP has no letter |

### Important letter warning
When work started, this stick was **F:**. Mid-session another USB (**Generic STORAGE DEVICE**, ~119 GiB, serial `000000000819`) appeared and took letters **F/G/H** (F labeled `BOOT`, G labeled `Clean`).

**Do not wipe current F:** — that is a different device. The installer is the **SanDisk Cruzer Glide** (serial above), currently **I:/J:** on Disk 4.

C:, D: (Work Station), and E: (Portable Archive) were **not** touched.

### Flash method
1. Rufus portable downloaded to `C:\Users\store\Downloads\rootmc-usb-tools\rufus-4.6p.exe` (not used for the final write; kept as backup).
2. `diskpart` → `select disk N` → `clean` on SanDisk only (matched by serial + name + USB + size &lt; 64 GiB).
3. Elevated Python Win32 `CreateFileW` / `WriteFile` raw write of the full ISO to `\\.\PhysicalDriveN` (buffered + `FILE_FLAG_WRITE_THROUGH`). First attempt with `FILE_FLAG_NO_BUFFERING` failed (`ERROR_INVALID_FUNCTION` / err=1) due to buffer alignment; buffered write completed.
4. Wrote exactly **2,918,598,656** bytes; Windows then saw hybrid **GPT** layout typical of Ubuntu live ISOs (≈2.9 GiB data + ESP + small partition).

Log: `C:\Users\store\Downloads\rootmc-usb-tools\flash-ubuntu-sandisk-write.log`

---

## OptiPlex boot / install steps (UEFI)

**Installer USB ≠ OS destination disk.** Boot the SanDisk stick; install Ubuntu onto the OptiPlex **internal** SSD/HDD only when you explicitly choose that disk in the installer.

1. Insert the **SanDisk Cruzer Glide** USB into the OptiPlex.
2. Power on → enter **UEFI/BIOS** (typical Dell: **F2**) or one-time **Boot Menu** (**F12**).
3. Confirm **UEFI** boot mode (not Legacy/CSM-only). Secure Boot can usually stay on for Ubuntu 26.04; if the stick does not appear, try Secure Boot off temporarily.
4. In the boot menu, pick the USB entry that looks like **UEFI: SanDisk …** (not a Windows Boot Manager entry on the internal disk).
5. Ubuntu live-server installer should start. Walk through language / network / disk setup.
6. **Disk caution:** select the **internal** OptiPlex drive as the install target. Do **not** install the OS onto the SanDisk installer USB.
7. After install, remove the USB, reboot, confirm UEFI boots the internal disk’s Ubuntu entry.
8. Do **not** run unattended install onto the OptiPlex internal disk until Alex explicitly asks.

### Dell OptiPlex keys (common)
- **F12** — one-shot boot menu  
- **F2** — BIOS/UEFI setup  

Exact labels vary by OptiPlex generation; if F12 is disabled, enable “F12 Boot Menu” under BIOS boot settings.

---

## Not done
- No install started on OptiPlex internal storage.
- No wipe of C:/D:/E:.
- Raspberry Pi Imager winget install was cancelled at UAC; not required after successful raw write.
