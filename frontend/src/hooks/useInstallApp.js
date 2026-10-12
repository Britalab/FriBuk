import { useState, useSyncExternalStore } from "react";
import {
  currentPlatform,
  getInstallState,
  promptInstall,
  subscribeInstallState,
} from "../utils/installApp";

// Estado de la instalación de FriBuk en este dispositivo.
// - platform: dónde está la persona (ver detectPlatform).
// - canPrompt: el navegador permite instalar con un botón propio.
// - install: abre la ventana de instalación del navegador.
export function useInstallApp() {
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstallState, getInstallState);
  const [platform] = useState(currentPlatform);

  return {
    platform: installed ? "installed" : platform,
    canPrompt,
    install: promptInstall,
  };
}
