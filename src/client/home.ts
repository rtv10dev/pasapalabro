import {
  MAX_NAME_LENGTH,
  parseCreateMatchRequest,
  parseCreatedMatch,
  type CreateMatchRequest,
} from "../shared/protocol";
import { newDeviceKey, rememberDeviceKey } from "./device-key";
import { showStatus } from "./dom";
import { rememberName, rememberedName } from "./remembered-name";
import { scanQr } from "./scan";

export function setUpHome(): void {
  document.querySelector("#scan")?.addEventListener("click", () => {
    showStatus("");
    void scanQr();
  });
  const form = document.querySelector<HTMLFormElement>("#create");
  const name = form?.querySelector<HTMLInputElement>('input[name="name"]');
  if (name) {
    name.maxLength = MAX_NAME_LENGTH;
    name.value = rememberedName();
  }
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const request = parseCreateMatchRequest({
      settings: {
        difficulty: data.get("difficulty"),
        clockSeconds: Number(data.get("clockSeconds")),
        hosted: data.get("hosted") === "on",
      },
      creator: { name: data.get("name"), device: newDeviceKey() },
    });
    if (!request) {
      showStatus("Revisa los datos de la partida.");
      return;
    }

    rememberName(request.creator.name);
    const submit = form.querySelector("button");
    if (submit) submit.disabled = true;
    void createMatch(request).then((id) => {
      if (id) {
        rememberDeviceKey(id, request.creator.device);
        location.assign(`/m/${id}`);
        return;
      }
      showStatus(
        "No se pudo crear la partida. Revisa tu nombre e inténtalo de nuevo.",
      );
      if (submit) submit.disabled = false;
    });
  });
}

async function createMatch(body: CreateMatchRequest): Promise<string | null> {
  try {
    const response = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return parseCreatedMatch(await response.json())?.id ?? null;
  } catch {
    return null;
  }
}
