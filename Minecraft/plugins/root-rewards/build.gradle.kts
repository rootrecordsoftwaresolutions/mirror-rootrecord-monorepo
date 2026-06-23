plugins {
    java
}

version = "1.0.1"

repositories {
    maven("https://jitpack.io")
}

dependencies {
    compileOnly("com.github.MilkBowl:VaultAPI:1.7.1")
}

tasks.named<Jar>("jar") {
    duplicatesStrategy = org.gradle.api.file.DuplicatesStrategy.EXCLUDE
}
