package com.rootrecord.rootmc.domain.model

/** Root Record account tier for UI (guest = local-only, no sign-in). */
enum class MembershipTier {
    Guest,
    SignedInFree,
    Pro,
    Lifetime,
}

fun MembershipTier.label(): String = when (this) {
    MembershipTier.Guest -> "Guest — local only"
    MembershipTier.SignedInFree -> "Free account"
    MembershipTier.Pro -> "Pro member"
    MembershipTier.Lifetime -> "Lifetime member"
}

fun MembershipTier.removesAds(): Boolean = this == MembershipTier.Pro || this == MembershipTier.Lifetime
