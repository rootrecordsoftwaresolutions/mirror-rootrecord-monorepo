package com.rootrecord.minecraft.rootblueprints.schematic;

import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.World;
import org.bukkit.block.Block;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ChunkSchematicCapture {

    private ChunkSchematicCapture() {}

    public record CaptureResult(
            int width,
            int height,
            int length,
            int offsetX,
            int offsetY,
            int offsetZ,
            int dataVersion,
            List<String> palette,
            int[] blockIndices) {}

    public static CaptureResult capture(int chunkX, int chunkZ, World world, int anchorX, int anchorY, int anchorZ) {
        int minY = world.getMinHeight();
        int maxY = world.getMaxHeight() - 1;
        int width = 16;
        int length = 16;
        int height = maxY - minY + 1;
        int baseX = chunkX << 4;
        int baseZ = chunkZ << 4;

        int offsetX = anchorX - baseX;
        int offsetY = anchorY - minY;
        int offsetZ = anchorZ - baseZ;

        Chunk chunk = world.getChunkAt(chunkX, chunkZ);
        Map<String, Integer> paletteMap = new LinkedHashMap<>();
        List<String> paletteOrder = new ArrayList<>();
        int[] blockIndices = new int[width * height * length];

        int index = 0;
        for (int y = minY; y <= maxY; y++) {
            for (int z = 0; z < 16; z++) {
                for (int x = 0; x < 16; x++) {
                    Block block = chunk.getBlock(baseX + x, y, baseZ + z);
                    String state = block.getBlockData().getAsString();
                    blockIndices[index++] = paletteIndex(state, paletteOrder, paletteMap);
                }
            }
        }

        int dataVersion = 3955;
        try {
            dataVersion = Bukkit.getUnsafe().getDataVersion();
        } catch (Throwable ignored) {
            // fallback for older API
        }

        return new CaptureResult(width, height, length, offsetX, offsetY, offsetZ, dataVersion, paletteOrder, blockIndices);
    }

    private static int paletteIndex(String state, List<String> paletteOrder, Map<String, Integer> paletteMap) {
        Integer existing = paletteMap.get(state);
        if (existing != null) {
            return existing;
        }
        int index = paletteOrder.size();
        paletteOrder.add(state);
        paletteMap.put(state, index);
        return index;
    }
}
