import { RoutingDecision } from "@/types/chat";
import { getRoutingIconConfig, getRoutingLabel } from "./utils";

interface RoutingBadgeProps {
  routingDecision?: RoutingDecision;
}

export function RoutingBadge({ routingDecision }: RoutingBadgeProps) {
  const { icon: Icon, className } = getRoutingIconConfig(routingDecision);
  
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-background/60 border border-border/30">
      <Icon className={className} />
      <span className="text-[10px] font-medium text-foreground/60">
        {getRoutingLabel(routingDecision)}
      </span>
    </div>
  );
}
