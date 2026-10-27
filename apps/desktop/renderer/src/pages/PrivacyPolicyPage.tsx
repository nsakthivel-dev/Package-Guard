import React, { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Immediately reset the nearest scrollable ancestor container (such as Layout's <main>)
    const resetScroll = () => {
      if (containerRef.current) {
        let parent: HTMLElement | null = containerRef.current.parentElement;
        while (parent) {
          if (parent.scrollTop > 0) {
            parent.scrollTop = 0;
          }
          parent = parent.parentElement;
        }
      }
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    // Re-verify after layout / animation frame to guarantee top position
    const rafId = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleBack = () => {
    setLocation("/settings");
  };

  return (
    <div ref={containerRef} className="min-h-full bg-background font-hanken text-on-surface" data-testid="privacy-policy-page">
      <header className="px-8 py-6 border-b border-outline-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-6 h-6 text-primary shrink-0" />
            <h1 className="text-[28px] font-bold text-on-surface leading-tight">
              Package Guard Privacy Policy
            </h1>
          </div>
          <p className="text-body-md text-on-surface-variant">
            Effective date: October 23, 2026
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleBack}
          className="rounded-xl border-outline-variant font-bold text-on-surface hover:bg-surface-container shrink-0 flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Settings
        </Button>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-10 flex flex-col gap-8">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-8 shadow-sm space-y-8">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              1. Introduction
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard is a Windows desktop application designed to help developers inspect and manage software dependency state through a graphical interface and the <code className="font-mono bg-surface-container-low px-1.5 py-0.5 rounded text-[13px] text-primary font-semibold">pg</code> command-line tool.
              </p>
              <p>
                This Privacy Policy explains how Package Guard handles information when you use the application.
              </p>
              <p>
                Our design principle is local-first operation. Application data is stored locally on your computer, and Package Guard does not intentionally collect personal information or transmit application usage data to us.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              2. Information We Collect
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard does not intentionally collect or transmit personal information, usage analytics, telemetry, or tracking data to its developer.
              </p>
              <p>
                The application may store information locally on your computer that is necessary for its functionality, including:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2">
                <li>Dependency state and package-related information.</li>
                <li>Application history and records of supported operations.</li>
                <li>Local application configuration and preferences.</li>
                <li>Other technical data required by the application's features.</li>
              </ul>
              <p>
                This information is stored locally and is not intentionally transmitted to the developer as part of Package Guard's normal operation.
              </p>
              <p>
                Information contained in your software projects or dependency metadata may include personal or confidential information. You are responsible for reviewing such information before sharing it with other parties.
              </p>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              3. Local Storage
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard uses a local SQLite database for supported application data and history.
              </p>
              <p>
                Application data is stored on your computer in the application's designated local data directory. The exact storage location may depend on the installation and configuration.
              </p>
              <p>
                Package Guard does not operate a developer-hosted cloud database for storing your application history.
              </p>
              <p>
                Access to locally stored information is subject to your Windows account permissions and the security of your device. You can manage locally stored application data through the available application features or documented data-management instructions.
              </p>
              <p>
                Uninstalling Package Guard may not automatically delete every user-data file. Back up any information you want to retain before uninstalling or modifying application data.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              4. Network Connections and Package Registries
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard may connect to external package registries or related services when you perform package-related operations.
              </p>
              <p>
                These connections may be used to retrieve package metadata, dependency information, or other information required by the requested operation.
              </p>
              <p>
                External registries and services operate under their own privacy policies and terms. When your computer connects to those services, they may receive technical information associated with the connection, such as your IP address, request details, or user-agent information, depending on the service and connection method.
              </p>
              <p>
                Package Guard does not control the data practices of external registries. Review the applicable service's privacy policy for details about its handling of connection data.
              </p>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              5. Analytics, Telemetry, and Advertising
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard is designed without built-in usage analytics, behavioral tracking, or advertising telemetry.
              </p>
              <p>
                We do not intentionally transmit application usage statistics, dependency history, or local database contents to the developer for analytics or advertising purposes.
              </p>
              <p>
                This statement describes Package Guard's intended behavior and does not cover telemetry that may be independently provided by Windows, external package registries, or other software installed on your computer.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              6. Third-Party Services
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard may interact with package registries or other external services required by supported functionality.
              </p>
              <p>
                Those services are independent of the Package Guard developer. Their availability, security, data collection, and privacy practices are governed by their own policies.
              </p>
              <p>
                Package Guard does not claim to control or guarantee the privacy practices of third-party services.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              7. Data Security
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard is designed to keep its application data on the user's computer.
              </p>
              <p>
                You are responsible for maintaining appropriate security on your device, including operating-system updates, account protection, backups, and access permissions.
              </p>
              <p>
                No method of local storage or electronic communication can be guaranteed to be completely secure.
              </p>
            </div>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              8. Children's Privacy
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Package Guard is a developer-oriented utility and is not designed to collect personal information from children. The application does not intentionally collect personal information from any user.
              </p>
            </div>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              9. Your Privacy Choices
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                Because Package Guard does not intentionally collect personal information for the developer's own use, it does not maintain a developer-hosted account or personal-data portal for this purpose.
              </p>
              <p>
                You can control your use of the application, manage relevant local files, and choose whether to perform operations that connect to external package registries.
              </p>
              <p>
                Requests concerning data held by third-party services should be directed to those services.
              </p>
            </div>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              10. Changes to This Policy
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <p>
                This Privacy Policy may be updated when Package Guard's functionality or data practices change.
              </p>
              <p>
                The revised policy will include an updated effective date. Users should review this policy periodically for changes.
              </p>
            </div>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h2 className="text-[18px] font-bold text-on-surface leading-snug">
              11. Contact
            </h2>
            <div className="space-y-3 text-[14px] text-on-surface-variant leading-relaxed">
              <div className="space-y-1.5 pl-1">
                <p><span className="font-semibold text-on-surface">Application:</span> Package Guard</p>
                <p><span className="font-semibold text-on-surface">Developer / Publisher:</span> Sakthivel N</p>
                <p><span className="font-semibold text-on-surface">Support email:</span> <span className="font-mono text-primary">nsakthiveldev@gmail.com</span></p>
              </div>
              <p className="pt-2">
                This policy applies to Package Guard's own data practices and should be updated if future versions introduce analytics, account services, cloud storage, or other data collection.
              </p>
            </div>
          </section>
        </div>

        <div className="flex justify-center pb-6">
          <Button
            variant="outline"
            onClick={handleBack}
            className="rounded-xl border-outline-variant font-bold text-on-surface hover:bg-surface-container flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Settings
          </Button>
        </div>
      </main>
    </div>
  );
}
