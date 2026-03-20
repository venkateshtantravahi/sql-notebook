group = "io.sqlnotebook"
version = "0.1.0"

plugins {
    application
}

repositories {
    mavenCentral()
}

configurations.all {
    resolutionStrategy {
        force("org.apache.commons:commons-compress:1.26.1")
    }
}

dependencies {
    implementation(libs.guava)
    implementation("com.zaxxer:HikariCP:7.0.2")
    implementation("com.mysql:mysql-connector-j:9.6.0")
    implementation("org.postgresql:postgresql:42.7.10")
    implementation("org.xerial:sqlite-jdbc:3.51.2.0")
    implementation("com.microsoft.sqlserver:mssql-jdbc:13.2.1.jre11")
    implementation("org.duckdb:duckdb_jdbc:1.4.4.0")
    implementation("com.oracle.database.jdbc:ojdbc17:23.26.1.0.0")
    implementation("org.eclipse.jetty:jetty-server:12.1.6")
    implementation("org.eclipse.jetty.ee10:jetty-ee10-servlet:12.1.6")
    implementation("org.eclipse.jetty.ee10.websocket:jetty-ee10-websocket-jakarta-server:12.1.6")
    implementation("tools.jackson.core:jackson-databind:3.1.0")
    implementation("jakarta.servlet:jakarta.servlet-api:6.0.0")
    implementation("jakarta.websocket:jakarta.websocket-api:2.2.0")
    implementation("org.eclipse.jetty.toolchain:jetty-jakarta-servlet-api:5.0.2")
    implementation("ch.qos.logback:logback-classic:1.5.32")
    implementation("org.apache.calcite:calcite-core:1.38.0")

    testImplementation("org.testcontainers:junit-jupiter:1.21.0")
    testImplementation("org.testcontainers:mysql:1.21.4")
    testImplementation("org.testcontainers:postgresql:1.21.4")
    testImplementation("org.testcontainers:mssqlserver:1.21.4")
    testImplementation("org.testcontainers:oracle-free:1.21.4")
    testImplementation("org.eclipse.jetty.ee10.websocket:jetty-ee10-websocket-jakarta-client:12.1.6")
}

testing {
    suites {
        named<JvmTestSuite>("test") {
            useJUnitJupiter()
        }
    }
}

dependencyAnalysis {
    issues {
        allprojects {
            onAny {
                severity("warn")
            }
        }
    }
}

val frontendDir = file("${rootProject.projectDir}/frontend")

val installFrontend by tasks.registering(Exec::class) {
    description = "Install frontend npm dependencies"
    group = "frontend"
    workingDir = frontendDir
    commandLine("npm", "install")
    inputs.file("${frontendDir}/package.json")
    inputs.file("${frontendDir}/package-lock.json")
    outputs.dir("${frontendDir}/node_modules")
}

val buildFrontend by tasks.registering(Exec::class) {
    description = "Build frontend with Vite"
    group = "frontend"
    workingDir = frontendDir
    commandLine("npm", "run", "build")
    dependsOn(installFrontend)
    inputs.dir("${frontendDir}/src")
    inputs.file("${frontendDir}/index.html")
    inputs.file("${frontendDir}/vite.config.js")
    outputs.dir("${rootProject.projectDir}/sql-notebook-core/src/main/resources/static")
}

tasks.named("processResources") {
    dependsOn(buildFrontend)
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

application {
    mainClass = "io.sqlnotebook.App"
}

// run task
tasks.named<JavaExec>("run") {
    val appVersion = project.version.toString()
    description = "Start the sql-notebook backend server"
    group = "application"
    workingDir = rootProject.projectDir
    standardInput = System.`in`
    doFirst {
        println("\n sql-notebook v$appVersion starting on http://localhost:8080\n")
    }
}

// javadoc task — generates API reference into docs/javadoc/
tasks.named<Javadoc>("javadoc") {
    description = "Generate Javadoc HTML into docs/javadoc/"
    group = "documentation"
    setDestinationDir(file("${rootProject.projectDir}/docs/javadoc"))
    (options as StandardJavadocDocletOptions).apply {
        encoding = "UTF-8"
        charSet = "UTF-8"
        windowTitle = "sql-notebook API"
        docTitle = "sql-notebook ${project.version} API"
        addStringOption("Xdoclint:none", "-quiet") // suppress warnings for undocumented members
    }
}

// ---------------------------------------------------------------------------
// jpackage  —  creates a native installer with .sqlnb file-type association.
//
// Platform output (jpackage must be run on the target OS):
//   macOS   →  build/package/sql-notebook-<ver>.dmg  +  sql-notebook.app
//   Linux   →  build/package/sql-notebook-<ver>.deb  (or .rpm with --type rpm)
//   Windows →  build/package/sql-notebook-<ver>.msi  (or .exe with --type exe)
//
// Requires JDK 14+ (jpackage ships with the JDK since JDK 14).
//   macOS also needs Xcode command-line tools.
//   Linux  also needs fakeroot + dpkg-deb (for .deb) or rpmbuild (for .rpm).
//   Windows also needs WiX Toolset 3.x (for .msi).
//
// Usage:
//   ./gradlew installDist jpackageApp
//
// Output is placed in build/package/.
// ---------------------------------------------------------------------------
tasks.register<Exec>("jpackageApp") {
    description = "Package sql-notebook as a native installer (requires JDK 14+, run on target OS)"
    group = "distribution"
    dependsOn(tasks.named("installDist"))

    val installDir       = layout.buildDirectory.dir("install/sql-notebook-core")
    val outputDir        = layout.buildDirectory.dir("package")
    val fileAssociations = file("${projectDir}/src/jpackage/file-associations.properties")
    val mainJarName      = "sql-notebook-core-${project.version}.jar"

    // Detect the best native package type for the current OS
    val os   = System.getProperty("os.name").lowercase()
    val type = when {
        os.contains("mac")  -> "dmg"
        os.contains("win")  -> "msi"
        else                -> "deb"   // Linux default; override with -Pjpackage.type=rpm
    }
    val packageType = project.findProperty("jpackage.type")?.toString() ?: type

    doFirst { file(outputDir.get().toString()).mkdirs() }

    commandLine(
        "jpackage",
        "--type",              packageType,
        "--name",              "sql-notebook",
        "--app-version",       project.version.toString(),
        "--input",             "${installDir.get()}/lib",
        "--main-jar",          mainJarName,
        "--main-class",        "io.sqlnotebook.App",
        "--dest",              outputDir.get().toString(),
        "--file-associations", fileAssociations.absolutePath,
        "--java-options",      "-Xmx512m",
        "--description",       "Interactive SQL notebook with multi-database support",
        "--vendor",            "sql-notebook",
    )
}

// dev run task — skips frontend build
tasks.register<JavaExec>("runDev") {
    val appVersion = project.version.toString()
    description = "Start backend only (skips frontend build - use during development)"
    group = "application"
    mainClass = "io.sqlnotebook.App"
    classpath = sourceSets["main"].runtimeClasspath
    workingDir = rootProject.projectDir
    standardInput = System.`in`
    doFirst {
        println("\n sql-notebook v$appVersion [dev] starting on http://localhost:8080\n")
        println("  Frontend not built - open frontend separately with: cd frontend && npm run dev")
    }
}
