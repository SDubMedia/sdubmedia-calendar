// ============================================================
// PrereqGate — wraps a primary action button. If `met` is false,
// clicking shows a modal explaining the unmet prerequisite + a
// CTA to take the user to the page where they can satisfy it.
// When `met` is true, renders children unchanged so the action
// proceeds normally.
//
// Usage:
//   <PrereqGate
//     met={data.clients.length > 0}
//     title="Add a client first"
//     body="Proposals are addressed to a client. Add one and come back."
//     ctaLabel="Add Client"
//     ctaHref="/clients"
//   >
//     <Button onClick={openProposalForm}>+ New Proposal</Button>
//   </PrereqGate>
// ============================================================

import { useState, cloneElement, isValidElement } from "react";
import type { ReactElement, MouseEvent } from "react";
import { useLocation } from "wouter";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  met: boolean;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  children: ReactElement;
}

export default function PrereqGate({ met, title, body, ctaLabel, ctaHref, children }: Props) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  if (!isValidElement(children)) return children;

  const childProps = (children as ReactElement<{ onClick?: (e: MouseEvent) => void }>).props;

  const wrapped = cloneElement(children as ReactElement<{ onClick?: (e: MouseEvent) => void }>, {
    onClick: (e: MouseEvent) => {
      if (met) {
        childProps.onClick?.(e);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    },
  });

  return (
    <>
      {wrapped}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>Not now</Button>
            <Button onClick={() => { setOpen(false); setLocation(ctaHref); }}>{ctaLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
