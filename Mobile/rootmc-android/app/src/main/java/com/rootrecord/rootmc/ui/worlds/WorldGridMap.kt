package com.rootrecord.rootmc.ui.worlds

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.rootrecord.rootmc.R
import com.rootrecord.rootmc.data.local.entity.MinecraftDimension
import kotlin.math.roundToInt

@Composable
fun WorldGridMap(
    waypoints: List<MapWaypointUi>,
    selectedCoordId: Long?,
    modifier: Modifier = Modifier,
) {
    val overworld = waypoints.filter {
        it.dimension.equals(MinecraftDimension.OVERWORLD.name, ignoreCase = true)
    }

    var centerX by remember { mutableFloatStateOf(0f) }
    var centerZ by remember { mutableFloatStateOf(0f) }
    var pxPerBlock by remember { mutableFloatStateOf(3f) }
    var panPx by remember { mutableStateOf(Offset.Zero) }
    var viewSize by remember { mutableStateOf(IntSize.Zero) }
    var userAdjustedView by remember { mutableStateOf(false) }

    fun applyFitView(focus: MapWaypointUi?) {
        val w = viewSize.width.toFloat()
        val h = viewSize.height.toFloat()
        if (w <= 0f || h <= 0f || overworld.isEmpty()) return

        val padBlocks = 64f
        val minX = overworld.minOf { it.x }.toFloat()
        val maxX = overworld.maxOf { it.x }.toFloat()
        val minZ = overworld.minOf { it.z }.toFloat()
        val maxZ = overworld.maxOf { it.z }.toFloat()

        val spanX: Float
        val spanZ: Float
        if (overworld.size > 1) {
            centerX = (minX + maxX) / 2f
            centerZ = (minZ + maxZ) / 2f
            spanX = (maxX - minX + padBlocks).coerceAtLeast(256f)
            spanZ = (maxZ - minZ + padBlocks).coerceAtLeast(256f)
        } else {
            val only = focus ?: overworld.first()
            centerX = only.x.toFloat()
            centerZ = only.z.toFloat()
            spanX = 256f
            spanZ = 256f
        }
        val fitScale = minOf(w / spanX, h / spanZ) * 0.88f
        pxPerBlock = fitScale.coerceIn(0.02f, 24f)
        panPx = Offset.Zero
    }

    LaunchedEffect(selectedCoordId) {
        userAdjustedView = false
    }

    LaunchedEffect(overworld, selectedCoordId, viewSize, userAdjustedView) {
        if (userAdjustedView || viewSize.width == 0) return@LaunchedEffect
        val focus = selectedCoordId?.let { id -> overworld.find { it.coordId == id } }
        applyFitView(focus)
    }

    val gridColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
    val chunkColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)
    val originColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)
    val markerColor = MaterialTheme.colorScheme.primary
    val selectedColor = MaterialTheme.colorScheme.tertiary

    Box(
        modifier = modifier
            .fillMaxSize()
            .onSizeChanged { viewSize = it }
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
    ) {
        if (overworld.isEmpty()) {
            Text(
                stringResource(R.string.world_map_grid_no_overworld),
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Box
        }

        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(overworld, selectedCoordId, viewSize) {
                    detectTapGestures(
                        onDoubleTap = {
                            userAdjustedView = false
                            val focus = selectedCoordId?.let { id ->
                                overworld.find { it.coordId == id }
                            }
                            applyFitView(focus)
                        },
                    )
                }
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        userAdjustedView = true
                        panPx += pan
                        if (zoom != 1f) {
                            pxPerBlock = (pxPerBlock * zoom).coerceIn(0.02f, 24f)
                        }
                    }
                },
        ) {
            val cx = size.width / 2f + panPx.x
            val cy = size.height / 2f + panPx.y
            val scale = pxPerBlock

            fun blockToScreen(bx: Int, bz: Int): Offset {
                return Offset(
                    cx + (bx - centerX) * scale,
                    cy + (bz - centerZ) * scale,
                )
            }

            val blocksWide = (size.width / scale).roundToInt() + 4
            val startX = (centerX - blocksWide / 2f).roundToInt()
            val endX = startX + blocksWide
            val blocksTall = (size.height / scale).roundToInt() + 4
            val startZ = (centerZ - blocksTall / 2f).roundToInt()
            val endZ = startZ + blocksTall

            var x = (startX / 16) * 16
            while (x <= endX) {
                val p1 = blockToScreen(x, startZ)
                val p2 = blockToScreen(x, endZ)
                drawLine(
                    color = if (x % 128 == 0) chunkColor else gridColor,
                    start = p1,
                    end = p2,
                    strokeWidth = if (x % 128 == 0) 2f else 1f,
                )
                x += 16
            }
            var z = (startZ / 16) * 16
            while (z <= endZ) {
                val p1 = blockToScreen(startX, z)
                val p2 = blockToScreen(endX, z)
                drawLine(
                    color = if (z % 128 == 0) chunkColor else gridColor,
                    start = p1,
                    end = p2,
                    strokeWidth = if (z % 128 == 0) 2f else 1f,
                )
                z += 16
            }

            val originOnScreen = blockToScreen(0, 0)
            val originVisible = originOnScreen.x in -24f..size.width + 24f &&
                originOnScreen.y in -24f..size.height + 24f
            if (originVisible) {
                drawLine(originColor, Offset(originOnScreen.x - 12f, originOnScreen.y), Offset(originOnScreen.x + 12f, originOnScreen.y), 2f)
                drawLine(originColor, Offset(originOnScreen.x, originOnScreen.y - 12f), Offset(originOnScreen.x, originOnScreen.y + 12f), 2f)
            }

            overworld.forEach { wp ->
                val p = blockToScreen(wp.x, wp.z)
                val selected = wp.coordId == selectedCoordId
                val r = if (selected) 10f else 7f
                val onScreen = p.x in -r..size.width + r && p.y in -r..size.height + r
                val drawAt = if (onScreen) {
                    p
                } else {
                    Offset(
                        p.x.coerceIn(r, size.width - r),
                        p.y.coerceIn(r, size.height - r),
                    )
                }
                val alpha = if (onScreen) 1f else 0.55f
                drawCircle(
                    color = (if (selected) selectedColor else markerColor).copy(alpha = alpha),
                    radius = if (onScreen) r else r * 0.75f,
                    center = drawAt,
                )
                if (onScreen) {
                    drawCircle(
                        color = Color.White,
                        radius = r,
                        center = drawAt,
                        style = Stroke(width = 2f),
                    )
                }
            }
        }

        Text(
            stringResource(
                R.string.world_map_grid_center,
                centerX.roundToInt(),
                centerZ.roundToInt(),
            ),
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            stringResource(R.string.world_map_grid_gestures),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(8.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
