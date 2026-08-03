plugins {
    java
}

version = "1.7.2"

tasks.named<Jar>("jar") {
    duplicatesStrategy = org.gradle.api.file.DuplicatesStrategy.EXCLUDE
}
