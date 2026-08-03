plugins {
    java
}

version = "1.0.1"

repositories {
    maven("https://jitpack.io")
}

dependencies {
    implementation("com.github.Querz:NBT:6.1")
}

tasks.named<Jar>("jar") {
    duplicatesStrategy = org.gradle.api.file.DuplicatesStrategy.EXCLUDE
    from({
        configurations.runtimeClasspath.get()
            .filter { it.name.endsWith("jar") }
            .map { zipTree(it) }
    })
}
