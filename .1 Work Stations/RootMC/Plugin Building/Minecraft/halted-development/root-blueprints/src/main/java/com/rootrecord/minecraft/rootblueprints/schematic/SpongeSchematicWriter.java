package com.rootrecord.minecraft.rootblueprints.schematic;

import net.querz.nbt.io.NamedTag;
import net.querz.nbt.io.NBTSerializer;
import net.querz.nbt.tag.CompoundTag;
import net.querz.nbt.tag.ListTag;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/** Writes Sponge Schematic Format v2 (.schem) as gzip-compressed NBT. */
public final class SpongeSchematicWriter {

    private SpongeSchematicWriter() {}

    public static byte[] write(ChunkSchematicCapture.CaptureResult capture, String schematicName) throws IOException {
        CompoundTag root = new CompoundTag();
        root.putInt("Version", 2);
        root.putInt("DataVersion", capture.dataVersion());
        root.putShort("Width", (short) capture.width());
        root.putShort("Height", (short) capture.height());
        root.putShort("Length", (short) capture.length());
        root.putIntArray("Offset", new int[] {capture.offsetX(), capture.offsetY(), capture.offsetZ()});

        CompoundTag metadata = new CompoundTag();
        metadata.putString("Name", schematicName == null ? "blueprint" : schematicName);
        root.put("Metadata", metadata);

        ListTag<CompoundTag> palette = new ListTag<>(CompoundTag.class);
        for (String state : capture.palette()) {
            CompoundTag entry = new CompoundTag();
            entry.putString("Name", state);
            palette.add(entry);
        }
        root.put("Palette", palette);
        root.putByteArray("BlockData", encodeVarInts(capture.blockIndices()));
        root.put("BlockEntities", new ListTag<>(CompoundTag.class));

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        new NBTSerializer(true).toStream(new NamedTag("", root), out);
        return out.toByteArray();
    }

    private static byte[] encodeVarInts(int[] values) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(values.length * 2);
        for (int value : values) {
            writeVarInt(out, value);
        }
        return out.toByteArray();
    }

    private static void writeVarInt(ByteArrayOutputStream out, int value) {
        int remaining = value;
        while (true) {
            if ((remaining & ~0x7F) == 0) {
                out.write(remaining);
                return;
            }
            out.write((remaining & 0x7F) | 0x80);
            remaining >>>= 7;
        }
    }
}
