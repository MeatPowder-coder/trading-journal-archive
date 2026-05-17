
import { useEffect, useState } from "react";

export function AnimatedBackground() {
    const [theme, setTheme] = useState<string>("dark");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        // Check initial theme
        const checkTheme = () => {
            const isNeon = document.documentElement.classList.contains("theme-neon");
            setTheme(isNeon ? "neon" : "dark");
        };

        checkTheme();

        // Setup an observer to watch for class changes on HTML tag
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    checkTheme();
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    if (!mounted) return null;

    // Render the animated background only for 'neon' theme to make it special
    if (theme !== "neon") return null;

    return (
        <>
            <div
                className="fixed inset-0 z-[-2] pointer-events-none"
                style={{
                    backgroundColor: '#000005',
                    backgroundImage: `
            linear-gradient(rgba(168, 85, 247, 0.25) 1px, transparent 1px),
            linear-gradient(90deg, rgba(168, 85, 247, 0.25) 1px, transparent 1px)
          `,
                    backgroundSize: '60px 60px',
                    animation: 'gridMove 10s linear infinite',
                }}
            />
            <div
                className="fixed inset-0 z-[-1] pointer-events-none"
                style={{
                    background: `
            radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.2), transparent 60%),
            radial-gradient(circle at 80% 20%, rgba(168, 85, 247, 0.2), transparent 50%)
          `,
                    animation: 'pulseAura 8s ease-in-out infinite alternate',
                }}
            />

            {/* Añadimos keyframes programáticamente en un block de estilo por seguridad */}
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes gridMove {
          0% { transform: translateY(0); }
          100% { transform: translateY(60px); }
        }
        @keyframes pulseAura {
          0% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0.5; transform: scale(1); }
        }
      `}} />
        </>
    );
}
