plugins {
    java
}

version = "1.1.0-SNAPSHOT"

sourceSets {
    named("main") {
        java {
            srcDir("../rootstat/src/main/java")
            exclude("**/RootStatPlugin.java")
            exclude("**/PlayerJoinListener.java")
        }
    }
}

repositories {
    maven("https://jitpack.io")
    maven("https://repo.extendedclip.com/content/repositories/placeholderapi/")
}

dependencies {
    implementation("com.zaxxer:HikariCP:6.2.1")
    implementation("com.mysql:mysql-connector-j:9.2.0")
    compileOnly("me.clip:placeholderapi:2.11.6")
}

tasks.named<Jar>("jar") {
    duplicatesStrategy = org.gradle.api.file.DuplicatesStrategy.EXCLUDE
    from({
        configurations.runtimeClasspath.get()
            .filter { it.name.endsWith("jar") }
            .map { zipTree(it) }
    })
}
