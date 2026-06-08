plugins {
    java
}

dependencies {
    // Folder + YAML helpers only — bundled into each plugin jar.
    if (rootProject.file("server/libraries/io/papermc/paper/paper-api/${property("paperApiBuild")}/paper-api-${property("paperApiBuild")}.jar").isFile) {
        compileOnly(files(rootProject.file("server/libraries/io/papermc/paper/paper-api/${property("paperApiBuild")}/paper-api-${property("paperApiBuild")}.jar")))
    } else {
        compileOnly("io.papermc.paper:paper-api:${property("paperApiVersion")}")
    }
}
