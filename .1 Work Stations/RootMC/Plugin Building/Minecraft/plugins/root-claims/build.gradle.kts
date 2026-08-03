plugins {
    java
}

version = "1.8.0"

repositories {
    maven("https://repo.bluecolored.de/releases")
}

dependencies {
    compileOnly("de.bluecolored:bluemap-api:2.7.7")
}

tasks.named<Jar>("jar") {
    duplicatesStrategy = org.gradle.api.file.DuplicatesStrategy.EXCLUDE
}
