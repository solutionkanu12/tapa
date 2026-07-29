"use client";

import { useEffect, useState } from "react";

import { announcedIcon, resolveProvider } from "./discovery";
import { useWallet } from "./WalletProvider";
import { WALLETS, type WalletId } from "./wallets";

type WalletPickerProps = {
  open: boolean;
  onClose: () => void;
};

export function WalletPicker({ open, onClose }: WalletPickerProps) {
  const { connect, discovered } = useWallet();
  const [connectingTo, setConnectingTo] = useState<string | null>(null);

  // Close on Escape, and stop the page behind the modal from scrolling.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Resets the transient spinner state alongside closing, so reopening the
  // picker always starts on the wallet list.
  const close = () => {
    setConnectingTo(null);
    onClose();
  };

  const handlePick = async (id: WalletId, name: string, installUrl: string) => {
    setConnectingTo(name);
    try {
      const result = await connect(id);

      if (result === "missing") {
        // Not installed, so send the user to get it rather than fail silently.
        window.open(installUrl, "_blank", "noopener,noreferrer");
        return;
      }

      if (result === "connected") close();
      // On "failed" the error banner explains why, so the picker stays open.
    } finally {
      setConnectingTo(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
      >
        {connectingTo ? (
          <div className="connecting-state">
            <div className="spinner" />
            <p className="hint">Connecting to {connectingTo}</p>
          </div>
        ) : (
          <>
            <h3 id="wallet-picker-title">Connect a wallet</h3>
            <p className="hint">
              Choose a Celo supporting wallet to open the tap.
            </p>

            {WALLETS.map((wallet) => {
              const found =
                resolveProvider(wallet, discovered).kind === "exact";
              // Prefer the icon the wallet announces about itself, then the
              // bundled brand mark, then the lettered badge.
              const icon = announcedIcon(wallet, discovered) ?? wallet.iconSrc;

              return (
                <button
                  type="button"
                  className="wallet-opt"
                  key={wallet.id}
                  onClick={() => {
                    handlePick(
                      wallet.id,
                      wallet.name,
                      wallet.installUrl
                    ).catch(() => setConnectingTo(null));
                  }}
                >
                  {icon ? (
                    <span className="wallet-badge has-icon" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={icon} alt="" width={24} height={24} />
                    </span>
                  ) : (
                    <span
                      className="wallet-badge"
                      style={{ background: wallet.badgeColor }}
                      aria-hidden="true"
                    >
                      {wallet.badge}
                    </span>
                  )}
                  <span className="label">{wallet.name}</span>
                  {found ? <span className="detected">Detected</span> : null}
                </button>
              );
            })}

            <button type="button" className="modal-close" onClick={close}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
