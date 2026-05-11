package com.rootrecord.kilauea.alerts.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val KilaueaColors = darkColorScheme(
    primary = LavaOrange,
    onPrimary = Color(0xFF1A0E0A),
    primaryContainer = EmberRed,
    onPrimaryContainer = TextPrimary,
    secondary = LavaGlow,
    onSecondary = Color.Black,
    tertiary = LavaGlow,
    background = VolcanicBg,
    onBackground = TextPrimary,
    surface = VolcanicSurface,
    onSurface = TextPrimary,
    surfaceVariant = VolcanicSurfaceVariant,
    onSurfaceVariant = TextMuted,
    error = Color(0xFFFF5449),
    onError = Color.Black,
)

@Composable
fun KilaueaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KilaueaColors,
        content = content,
    )
}
