final: prev: {
  hoyofall = final.callPackage ./package.nix {
    nodejs = final.nodejs_26 or final.nodejs;
    pnpm = final.pnpm;
  };
}
