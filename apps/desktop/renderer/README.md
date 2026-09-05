# 🛡️ PackageGuard: Institutional Security Auditor

**PackageGuard** is a sophisticated desktop application designed for real-time security auditing and dependency management. It provides a centralized, high-density interface for developers and security teams to monitor software health across global registries (PyPI, NPM) and isolated local virtual environments (venvs).

## 🚀 Key Features

- **Single-Screen Analytics**: A zero-scroll "Detailed Analysis" dashboard providing deep-dive metrics into package health, version drift, and risk assessment.
- **Environment Autodiscovery**: Automatically tracks and audits local Python virtual environments and global Node.js modules.
- **Institutional-Grade Auditing**: Real-time monitoring of package status (Healthy, Patch, Minor, Major, Failed) with visual risk indicators.
- **Bulk Version Control**: One-click updates for multiple packages across disparate environments.
- **State Snapshots**: Capture and freeze environment manifests for compliance and reproducible security handshakes.
- **Audit History**: A full chronological log of all system scans, updates, and environment modifications.

## 🛠️ Tech Stack

- **Framework**: Electron (Desktop Integration)
- **Frontend**: React (Vite)
- **Styling**: Tailwind CSS & Shadcn UI
- **State Management**: TanStack Query (React Query)
- **Visuals**: Recharts (High-density Data Visualization)
- **Icons**: Lucide React & Google Material Symbols

## 🎯 The Problem Statement

In modern software development, dependencies are often scattered across dozens of isolated environments. Manually tracking version drift and security vulnerabilities is a massive operational bottleneck. **PackageGuard** solves this by bridging the gap between local development and institutional security standards, providing a modern, reactive interface for complex dependency auditing.

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/nsakthivel-dev/PackageGuard.git
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run in development mode**:
   ```bash
   npm run dev
   ```
4. **Build for production**:
   ```bash
   npm run build
   ```

## 📄 License

© 2024 PackageGuard Institutional Security. Version 2.4.0-stable.
