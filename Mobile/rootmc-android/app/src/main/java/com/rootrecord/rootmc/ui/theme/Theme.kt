package com.rootrecord.rootmc.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val RootMCDarkColors = darkColorScheme(
    primary = EmeraldPrimary,
    onPrimary = Color(0xFF0A1F12),
    primaryContainer = GrassGreen,
    onPrimaryContainer = TextPrimary,
    secondary = EmeraldGlow,
    onSecondary = Color.Black,
    tertiary = GrassGreen,
    background = StoneBg,
    onBackground = TextPrimary,
    surface = StoneSurface,
    onSurface = TextPrimary,
    surfaceVariant = StoneSurfaceVariant,
    onSurfaceVariant = TextMuted,
    error = Color(0xFFFF5449),
    onError = Color.Black,
)

private val RootMCLightColors = lightColorScheme(
    primary = GrassGreen,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFC8F0D4),
    onPrimaryContainer = Color(0xFF0A2E14),
    secondary = EmeraldPrimary,
    onSecondary = Color.Black,
    tertiary = EmeraldGlow,
    background = RootMCLightBg,
    onBackground = RootMCLightText,
    surface = RootMCLightSurface,
    onSurface = RootMCLightText,
    surfaceVariant = RootMCLightSurfaceVariant,
    onSurfaceVariant = RootMCLightTextMuted,
    error = Color(0xFFBA1A1A),
    onError = Color.White,
)

@Composable
fun RootMCTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) RootMCDarkColors else RootMCLightColors,
        content = content,
    )
}
