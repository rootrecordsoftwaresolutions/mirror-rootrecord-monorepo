import org.gradle.api.file.DuplicatesStrategy
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.api.tasks.bundling.Jar
import org.gradle.api.tasks.compile.JavaCompile
import org.gradle.jvm.toolchain.JavaLanguageVersion
import org.gradle.language.jvm.tasks.ProcessResources

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

    val isDeployablePlugin = project.file("src/main/resources/plugin.yml").exists()
        && project.name != "rootrecord-common"

    if (isDeployablePlugin) {
        tasks.register<Copy>("copyPluginJar") {
            group = "deployment"
            description = "Copy built jar to Minecraft/out/"
            dependsOn(tasks.named("jar"))
            from(tasks.named<Jar>("jar"))
            into(rootProject.layout.projectDirectory.dir("out"))
        }

        tasks.register<Copy>("deployToServer") {
            group = "deployment"
            description = "Copy built jar to server/plugins/ for local Paper testing."
            dependsOn(tasks.named("jar"))
            from(tasks.named<Jar>("jar"))
            into(serverPluginsDir)
        }

        tasks.named("build") {
            dependsOn("copyPluginJar", "deployToServer")
        }
    }
}

tasks.register("buildAllPlugins") {
    group = "build"
    description = "Build every included Minecraft plugin subproject."
    dependsOn(subprojects.map { "${it.path}:build" })
}

tasks.register("deployAllPlugins") {
    group = "deployment"
    description = "Build and copy every plugin jar to server/plugins/."
    dependsOn(
        subprojects
            .filter { it.file("src/main/resources/plugin.yml").exists() && it.name != "rootrecord-common" }
            .map { "${it.path}:deployToServer" },
    )
}
