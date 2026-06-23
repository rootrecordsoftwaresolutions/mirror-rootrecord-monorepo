import groovy.json.JsonOutput
import org.gradle.api.Project
import org.gradle.api.file.DuplicatesStrategy
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.api.tasks.bundling.Jar
import org.gradle.api.tasks.compile.JavaCompile
import org.gradle.jvm.toolchain.JavaLanguageVersion
import org.gradle.language.jvm.tasks.ProcessResources
import java.io.File

val localProperties = java.util.Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

val javaVersion = JavaLanguageVersion.of(
    (localProperties.getProperty("java.version") ?: findProperty("javaVersion") as String? ?: "25").toInt(),
)

// Prefer the API jar bundled with server/ (exact match to your Paper build).
val serverApiJar = rootProject.file(
    "server/libraries/io/papermc/paper/paper-api/${property("paperApiBuild")}/paper-api-${property("paperApiBuild")}.jar",
)
val paperApiMaven = "io.papermc.paper:paper-api:${property("paperApiVersion")}"
val serverPluginsDir = rootProject.layout.projectDirectory.dir("server/plugins")
val hostHandoffPluginsDir = rootProject.layout.projectDirectory.dir("server/host-handoff/plugins")
val webPluginsDir = rootProject.layout.projectDirectory.dir("../Web/apps/rootmc-web/public/plugins")
val rootMcCurrentDir = File(
    System.getenv("USERPROFILE") ?: System.getProperty("user.home"),
    "Desktop/RootMC - Current",
)
val liveServerPluginsDir: File = run {
    val fromProps = localProperties.getProperty("rootmc.live.plugins.dir")?.trim()
    when {
        !fromProps.isNullOrBlank() -> rootProject.file(fromProps)
        else -> File(rootMcCurrentDir, "plugins")
    }
}
val pluginPublishBaseUrl = "https://rootmc.net/plugins"

fun deployablePluginProjects(): List<Project> =
    subprojects.filter {
        it.path.startsWith(":plugins:")
            && it.file("src/main/resources/plugin.yml").exists()
            && it.name != "rootrecord-common"
    }

/** Plugins returned in heartbeat plugin_updates + manifest.json on rootmc.net/plugins */
val heartbeatManifestPluginNames = listOf(
    "rootmc",
    "rootmc-shops",
    "roothelp",
    "root-essentials",
    "root-rewards",
)

subprojects {
    apply(plugin = "java")

    group = findProperty("group") as String? ?: "com.rootrecord.minecraft"
    version = findProperty("version") as String? ?: "1.0.0-SNAPSHOT"

    repositories {
        mavenCentral()
        maven("https://repo.papermc.io/repository/maven-public/")
    }

    dependencies {
        if (serverApiJar.isFile) {
            add("compileOnly", files(serverApiJar))
        } else {
            add("compileOnly", paperApiMaven)
        }
        // Local paper-api jar omits transitive Adventure/BungeeChat — needed for compile.
        add("compileOnly", "net.kyori:adventure-api:4.26.1")
        add("compileOnly", "net.kyori:adventure-text-serializer-legacy:4.26.1")
        add("compileOnly", "net.md-5:bungeecord-chat:1.21-R0.2")
        if (project.path.startsWith(":plugins:") && project.name != "rootrecord-common") {
            add("implementation", project(":plugins:rootrecord-common"))
        }
    }

    configure<JavaPluginExtension> {
        toolchain {
            languageVersion.set(javaVersion)
        }
    }

    tasks.withType<JavaCompile>().configureEach {
        options.encoding = "UTF-8"
        options.release.set(javaVersion.asInt())
    }

    tasks.named<ProcessResources>("processResources") {
        val pluginVersion = project.version.toString()
        filesMatching("plugin.yml") {
            expand(mapOf("version" to pluginVersion))
        }
    }

    tasks.named<Jar>("jar") {
        archiveClassifier.set("")
        if (project.path.startsWith(":plugins:") && project.name != "rootrecord-common") {
            dependsOn(":plugins:rootrecord-common:compileJava")
            from(rootProject.project(":plugins:rootrecord-common").extensions.getByType(JavaPluginExtension::class.java).sourceSets.getByName("main").output)
            duplicatesStrategy = DuplicatesStrategy.EXCLUDE
        }
    }

    val isDeployablePlugin = project.path.startsWith(":plugins:")
        && project.file("src/main/resources/plugin.yml").exists()
        && project.name != "rootrecord-common"

    if (isDeployablePlugin) {
        val jarTask = tasks.named<Jar>("jar")

        fun owningPluginName(jarName: String): String? =
            rootProject.subprojects
                .filter {
                    it.path.startsWith(":plugins:")
                        && it.file("src/main/resources/plugin.yml").exists()
                        && it.name != "rootrecord-common"
                }
                .map { it.name }
                .sortedByDescending { it.length }
                .firstOrNull { jarName.startsWith("$it-") && jarName.endsWith(".jar") }

        fun pruneStalePluginJars(targetDir: File, keepName: String) {
            if (!targetDir.isDirectory) return
            targetDir.listFiles()
                ?.filter {
                    it.isFile
                        && it.name.endsWith(".jar")
                        && owningPluginName(it.name) == project.name
                        && it.name != keepName
                }
                ?.forEach { it.delete() }
        }

        tasks.register<Copy>("copyPluginJar") {
            group = "deployment"
            description = "Copy built jar to Minecraft/out/"
            dependsOn(jarTask)
            from(jarTask)
            into(rootProject.layout.projectDirectory.dir("out"))
            doLast { pruneStalePluginJars(rootProject.layout.projectDirectory.dir("out").asFile, jarTask.get().archiveFileName.get()) }
        }

        tasks.register<Copy>("deployToServer") {
            group = "deployment"
            description = "Copy built jar to server/plugins/ for local Paper testing."
            dependsOn(jarTask)
            from(jarTask)
            into(serverPluginsDir)
            doLast { pruneStalePluginJars(serverPluginsDir.asFile, jarTask.get().archiveFileName.get()) }
        }

        tasks.register<Copy>("copyPluginJarToHostHandoff") {
            group = "deployment"
            description = "Copy built jar to server/host-handoff/plugins/ for Shockbyte upload."
            dependsOn(jarTask)
            from(jarTask)
            into(hostHandoffPluginsDir)
            doLast { pruneStalePluginJars(hostHandoffPluginsDir.asFile, jarTask.get().archiveFileName.get()) }
        }

        tasks.register<Copy>("copyPluginJarToLiveServer") {
            group = "deployment"
            description = "Copy built jar to Desktop/RootMC - Current/plugins/ (FileZilla sync folder)."
            dependsOn(jarTask)
            from(jarTask)
            into(liveServerPluginsDir)
            doFirst { liveServerPluginsDir.mkdirs() }
            doLast { pruneStalePluginJars(liveServerPluginsDir, jarTask.get().archiveFileName.get()) }
        }

        tasks.register<Copy>("copyPluginJarToWebPublish") {
            group = "deployment"
            description = "Copy built jar to Web/apps/rootmc-web/public/plugins/ for rootmc.net."
            dependsOn(jarTask)
            from(jarTask)
            into(webPluginsDir)
            doLast { pruneStalePluginJars(webPluginsDir.asFile, jarTask.get().archiveFileName.get()) }
        }

        tasks.named("build") {
            dependsOn(
                "copyPluginJar",
                "deployToServer",
                "copyPluginJarToHostHandoff",
                "copyPluginJarToLiveServer",
            )
        }
    }
}

tasks.register("generatePluginManifest") {
    group = "deployment"
    description = "Write Web/apps/rootmc-web/public/plugins/manifest.json from plugin versions."
    dependsOn(deployablePluginProjects().map { "${it.path}:copyPluginJarToWebPublish" })
    doLast {
        val manifest = linkedMapOf<String, Any>()
        for (name in heartbeatManifestPluginNames) {
            val proj = project(":plugins:$name")
            val version = proj.version.toString()
            val filename = "${proj.name}-$version.jar"
            manifest[name] = mapOf(
                "version" to version,
                "filename" to filename,
                "url" to "$pluginPublishBaseUrl/$filename",
            )
        }
        val manifestFile = webPluginsDir.asFile.resolve("manifest.json")
        manifestFile.parentFile.mkdirs()
        manifestFile.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(manifest)) + System.lineSeparator())
    }
}

tasks.register("pruneObsoletePluginJars") {
    group = "deployment"
    description = "Remove retired plugin jars (blocknotes, plugin-template, unknown prefixes)."
    doLast {
        val allowedPrefixes = deployablePluginProjects().map { "${it.name}-" }.toSet()
        val retiredPrefixes = setOf("blocknotes-", "rootstat-", "plugin-template-")
        val dirs = listOf(
            rootProject.layout.projectDirectory.dir("out").asFile,
            hostHandoffPluginsDir.asFile,
            liveServerPluginsDir,
            serverPluginsDir.asFile,
        )
        for (folder in dirs) {
            if (!folder.isDirectory) continue
            folder.listFiles()
                ?.filter { it.isFile && it.name.endsWith(".jar") }
                ?.forEach { file ->
                    val retired = retiredPrefixes.any { file.name.startsWith(it) }
                    val known = allowedPrefixes.any { file.name.startsWith(it) }
                    if (retired || !known) {
                        file.delete()
                    }
                }
        }
    }
}

tasks.register("publishPlugins") {
    group = "deployment"
    description = "Build all Paper plugins; copy jars to out/, Desktop/RootMC - Current/plugins/, host-handoff/, server/plugins/."
    dependsOn(deployablePluginProjects().map { "${it.path}:build" })
    finalizedBy("pruneObsoletePluginJars")
}

tasks.register("buildAllPlugins") {
    group = "build"
    description = "Build every deployable plugin under plugins/ (excludes plugin-template scaffold)."
    dependsOn(deployablePluginProjects().map { "${it.path}:build" })
}

tasks.register("deployAllPlugins") {
    group = "deployment"
    description = "Build and copy every plugin jar to server/plugins/."
    dependsOn(deployablePluginProjects().map { "${it.path}:deployToServer" })
}
