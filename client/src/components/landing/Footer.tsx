import Logo from "@/components/Logo";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="py-12 px-6 border-t border-border">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-3">
            <Logo size="small" />
            <p className="text-sm text-muted-foreground max-w-xs">
              Real-time collaborative code editing for developers who value focus and reliability.
            </p>
          </div>

          <div className="flex gap-12">
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/workspace" className="hover:text-foreground transition-colors">
                    Workspace
                  </Link>
                </li>
                <li>
                  <button
                    onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                    className="hover:text-foreground transition-colors"
                  >
                    How It Works
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => document.getElementById("use-cases")?.scrollIntoView({ behavior: "smooth" })}
                    className="hover:text-foreground transition-colors"
                  >
                    Use Cases
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Built for developers who value focus and collaboration.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
