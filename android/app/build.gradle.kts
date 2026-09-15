/**
 * Application-Level Gradle Build Configuration
 * Configures Android SDK versions, explicit NDK toolchain pinning,
 * JVM target compatibility, and Flutter Gradle plugin integration.
 * Standalone kotlin-android plugin has been removed to eliminate AGP 9 DSL ClassCastException.
 */
plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.example.pos_app"
    compileSdk = flutter.compileSdkVersion

    // Explicit NDK toolchain pinning matching local installation
    ndkVersion = "28.2.13676358"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.example.pos_app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}