plugins {
    java
}

version = "1.8.0"

tasks.named<Jar>("jar") {
    duplicatesStrategy = org.gradle.api.file.DuplicatesStrategy.EXCLUDE
}
