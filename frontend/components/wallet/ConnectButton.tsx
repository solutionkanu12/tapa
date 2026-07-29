"use client";

import { useState } from "react";

import { formatAddress } from "./types";
import { WalletPicker } from "./WalletPicker";
import { useWallet } from "./WalletProvider";

type ConnectButtonProps = {
  className?: string;
  label: string;
  /**
   * When true, the button is replaced by the connected address once a wallet
   * is attached. Used in the nav; the hero and closing CTAs keep their label
   * so the landing page's layout does not shift.
   */
  showAddressWhenConnected?: boolean;
};

export function ConnectButton({
  className,
  label,
  showAddressWhenConnected = false,
}: ConnectButtonProps) {
  const { status, address, connect, disconnect, isMiniPay } = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleClick = () => {
    // Inside MiniPay there is only one wallet, so a picker would be noise.
    if (isMiniPay) {
      void connect("minipay");
      return;
    }
    setPickerOpen(true);
  };

  if (showAddressWhenConnected && status === "connected" && address) {
    return (
      <div className="nav-wallet">
        <span className="nav-wallet-dot" aria-hidden="true" />
        <span className="mono" title={address}>
          {formatAddress(address)}
        </span>
        <button type="button" className="nav-wallet-action" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={status === "connecting"}
      >
        {showAddressWhenConnected && status === "connecting"
          ? "Connecting..."
          : label}
      </button>
      <WalletPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}
