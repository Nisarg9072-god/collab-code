import { Code2 } from "lucide-react";

const Logo = ({ size = "default" }: { size?: "default" | "small" }) => {
  const iconSize = size === "small" ? "h-5 w-5" : "h-6 w-6";
  const textSize = size === "small" ? "text-base" : "text-lg";

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center rounded-md bg-primary p-1.5">
        <Code2 className={`${iconSize} text-primary-foreground`} />
      </div>
      <span className={`${textSize} font-semibold tracking-tight text-foreground`}>
        CollabCode
      </span>
    </div>
  );
};

export default Logo;
