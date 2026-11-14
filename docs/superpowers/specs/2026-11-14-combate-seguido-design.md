# Subasta Pokémon: combate seguido, sin K.O. ni pausa (#57)

Boceto aprobado por Marco el 2026-11-14 (en la conversación, con los de #56 y #58). Las decisiones de la issue son de Marco (2026-11-01); las marcadas «del agente» las tomé yo y Marco aprobó el boceto que las mostraba.

## Intención

El combate debe sentirse seguido, como en Showdown: al caer un Pokémon no hay rótulo ni pantalla aparte; quien lo perdió elige al siguiente desde la misma pantalla y el combate continúa.

## Reglas

1. **Sin pausa.** Desaparecen la fase `battle_pause`, `PAUSE_CONFIRM`, `PauseChoice`, `myPause`, `PauseView` y el rótulo «K.O.».
2. **Al caer un Pokémon solo elige quien lo perdió.** El que sigue vivo no cambia gratis y **conserva sus niveles de stats** (como en Showdown; antes se limpiaban en cada asalto). Quien sale sí los pierde, como al cambiar.
3. **Elegir al siguiente** reutiliza el cambio (`CHOOSE_SWITCH`): solo vale un Pokémon propio, vivo y que no esté peleando. **Sin reloj**, con el aviso «¿Sigues ahí?» de siempre; si se agota, sale el primero vivo en su orden.
4. **Si caen los dos a la vez**, eligen los dos; ninguno ve la elección del otro hasta que han elegido los dos (o se agotó el aviso), y entran a la vez.
5. **Límite:** a los 20 turnos seguidos sin que caiga nadie, cae quien tenga menos porcentaje de PS (`roundLimitLoser`, como hoy). El contador se reinicia con cada caída.
6. **Final:** pierde quien se queda sin Pokémon vivos. Si se quedan sin ninguno los dos a la vez, pierde el más lento de los dos últimos (`bothFallenLoser`, como hoy).

## Cómo se modela (del agente)

- `round` deja de mostrarse. Por dentro sigue siendo el **tramo** entre caídas: cada entrada de reemplazo abre uno nuevo. Así el registro del cliente, que descarta lo repetido por `(round, turn)`, admite la entrada sin tocar su lógica, y `turn` sigue contando todos los turnos de la partida.
- Tras la animación del turno en que cae alguien, el combate sigue en la fase `battle` con `replacing` (los asientos que deben elegir) y `replacements` (lo elegido, privado). Cuando han elegido todos, se emite un `battle-turn` sin acciones, con los cambios y las notas de entrada, y tras su animación empieza el turno siguiente.
- El evento `battle-round-ended` pasa a `battle-fainted` `{ fallen: Seat[]; atLimit: boolean }`, para el sonido y el lector de pantalla.
- La vista añade `mustReplace`, `rivalReplacing`, `myReplacement` (para recargar) y `calmTurns`.
- El contador dice «Turno N»; en los últimos 5 turnos antes del límite añade «· Límite N/20» (del agente).
- La caída se ve con la animación: el sprite debilitado se desvanece y baja, y la franja dice «¡X se debilitó!».

## El simulador

Usa las mismas reglas: combate seguido, el superviviente conserva sus stats, límite de 20 turnos seguidos sin caídas, y el reemplazo es el más fuerte vivo (como su `prepare`). Se revisa el equilibrio con `npm run auction:simulate -w server`.

## Criterios (de la issue)

- Sin rótulo de K.O. ni pantalla de pausa.
- Elegir al siguiente es secreto hasta resolverse y funciona tras recargar o caerse.
- Ninguna partida se cuelga ni se alarga sin límite: partidas al azar, también con desconexiones.
- TDD, mutaciones de lo crítico (secreto del reemplazo, límite de turnos, final), E2E de la partida completa y revisión final independiente.
