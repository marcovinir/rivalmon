# Subasta Pokémon: turnos claros y presentación por pasos

Issue #59. **Propuesta pendiente de aprobación de Marco.** No se ha implementado el cambio del juego.

## Intención y alcance

Entender cada turno sobre el escenario, sin tener que leer el registro: primero los cambios, después cada acción en su orden real y al final los efectos de cierre. Los PS y los sprites deben acompañar ese orden, en lugar de mostrar de inmediato el resultado completo recibido por Socket.io.

Se conserva el aspecto del combate aprobado en las specs de [combate](2026-10-31-subasta-v2-combate-design.md) y [movimientos](2026-10-31-subasta-v2-movimientos-design.md). Esta propuesta no es el boceto de las issues #57, #58 o #56.

## Requisitos de Marco que se mantienen

- Se distingue quién actúa y cuándo, con texto breve sobre el escenario.
- Fallar, estar bloqueado o no afectar muestra su explicación, sin embestida ni golpe.
- Los efectos de estado y las variaciones de stats se ven sobre el Pokémon afectado.
- No hay reloj para elegir. Las elecciones siguen siendo secretas: ni el movimiento del rival ni si ya eligió se presentan antes de resolver.
- Nunca se añaden los PP ni los movimientos no revelados del rival a su vista.
- El motor sigue siendo puro; el combate y el simulador comparten las reglas existentes de `combat.ts`.
- Recargar durante una animación recupera el estado actual sin repetir el último golpe.
- El lector de pantalla recibe el resumen una sola vez por turno.
- Con reducir movimiento se conservan textos y destellos y se usan imágenes fijas; las excepciones CSS llevan su propio `!important` al final de `index.css`.
- PS, PP y potencia siguen usando letra normal. Se comprueba la interfaz a 360 × 760, a 375 px y en escritorio, en los cuatro temas/modos.

## Hallazgos de la lectura del código

- `BattleScreen.tsx` dibuja los equipos directamente desde `view.auction.battle`. El `room-state` posterior al `battle-turn` ya contiene todos los PS finales y los titulares cambiados, por lo que no espera al golpe correspondiente.
- `useStrike` filtra únicamente `damage > 0`. No representa por pasos los fallos, los bloqueos ni el apoyo, y no comprueba explícitamente los indicadores de fallo/bloqueo al decidir una embestida.
- El hook arranca al montarse con una clave de asalto/turno. Un registro conservado con esa misma clave puede volver a reproducirse al remontar la pantalla. Se escribirá primero la regresión que lo demuestre; todavía no se ha ejecutado esa prueba.
- El servidor espera siempre `TURN_ANIMATION_MS = 3000`, independientemente de cambios, acciones y notas.
- El contrato actual ya trae `switches`, las acciones ordenadas, `actorHp`, `targetHp`, y las notas de entrada, acción y cierre. No hace falta añadir información privada ni cambiar el payload público para presentar esta secuencia.

## Propuesta de implementación

### Una secuencia pura compartida

Una función pura en `shared/` convierte el resultado ya público del turno en pasos y duraciones. El servidor suma esas duraciones para programar el siguiente paso del motor; el cliente presenta los mismos pasos. No se consume azar ni se calcula daño en esta función.

Orden propuesto:

1. Notas del comienzo del asalto, con los nombres de quienes estaban entonces.
2. Cambios de Pokémon, mostrando primero al que entra con sus PS anteriores al ataque.
3. Notas de entrada, como Intimidación.
4. Cada acción en el orden recibido, con sus notas inmediatamente después.
5. Notas de cierre, como quemadura, veneno o Impulso.
6. Un cierre breve que deja visibles los resultados y, cuando corresponde, el K.O. actual.

Propuesta inicial de ritmo: 250 ms de preparación y 950 ms de impacto para un ataque con daño; 1200 ms para explicar una acción sin ataque; 700 ms por cambio, 900 ms por nota y 500 ms de cierre. Son tiempos de presentación, sin cambios de reglas. Se ajustarán únicamente si la comprobación visual encuentra que un texto no se alcanza a leer; el cliente y el servidor seguirán compartiendo la misma definición.

No se anima un ataque por el mero hecho de que exista una acción. Una embestida requiere daño y una acción que no esté bloqueada, no haya fallado y sí afecte al rival. El apoyo, la curación y los efectos sin daño tienen su texto y su señal correspondiente, sin una embestida ficticia.

### Estado del servidor y estado que se presenta

El reductor del cliente conserva el estado autoritativo del servidor. Al recibir un `battle-turn`, guarda junto a la entrada del registro una instantánea local de la vista anterior y los cambios ya revelados.

La presentación deriva de esa instantánea los cuadros del turno. Mientras se reproducen, las barras, los titulares, los estados y los niveles del escenario muestran el cuadro correspondiente. Los controles permanecen cerrados. El nuevo `room-state` no adelanta los PS ni el sprite que se está presentando.

En el impacto se aplica el daño. Las curaciones, el retroceso y el daño residual se presentan en su paso; los PS intermedios se contrastan con `actorHp` y `targetHp` para terminar en los valores publicados por el servidor. Al cerrar se adopta íntegramente su vista actual, incluido un K.O. por límite de turnos.

La reproducción solo empieza por un evento nuevo recibido con la pantalla montada. El registro previo no la inicia. Se cancelan sus temporizadores al desmontar, cambiar de sala, abandonar o pasar a otro asalto. Una recarga recibe un `room-state` y muestra directamente su estado, sin inventar una secuencia perdida.

### Señales sobre los Pokémon

- Quemadura: señal naranja; veneno: morada; parálisis: amarilla; sueño: tono frío. Se mantiene el nombre del estado, sin depender solo del color.
- Subida o bajada de stat: señal breve sobre el afectado, con el nombre del stat y su dirección.
- Ataque con daño: embestida en la preparación y golpe en el impacto. Con reducir movimiento solo queda el destello del impacto.
- Los textos de los pasos son visuales (`aria-hidden`), sin otra región viva. El anuncio accesible existente sigue resumiendo el turno una sola vez.

Las señales reutilizan los sprites reales y no incorporan los 18 efectos de ataque por tipo: su integración pertenece a #42.

## Límites y no objetivos

No se cambian movimientos, habilidades, daño, azar, PP, elección secreta, gracia de desconexión ni límite de turnos. Se conservan el K.O. y la pausa entre asaltos hasta #57, los botones hasta #58 y la alineación hasta #56. No se añade una confirmación manual para avanzar la secuencia.

Antiobjetivos: no resolver otra vez el combate en el cliente, no hacer depender el avance del servidor de que termine una animación del navegador, no revelar decisiones anticipadamente y no sustituir los sprites reales por figuras inventadas.

Los pasos proceden exclusivamente del resultado finito que genera el servidor. El avance continúa gobernado por un temporizador del motor, incluso si nadie está mirando la animación. Se comprueba que ni los efectos ni una desconexión dejan la partida esperando indefinidamente.

## Criterios para revisar la implementación

- Una prueba reproduce el golpe repetido antes de corregirlo; otra demuestra los PS finales adelantados.
- Las pruebas recorren dos ataques, cambios, fallo, bloqueo, inmunidad, apoyo, curación, retroceso y daño de estado.
- Los PS iniciales se conservan hasta el impacto, y el cierre coincide con la vista autoritativa.
- La duración del motor incluye todos los pasos y vuelve a permitir elegir o pasa a pausa al terminar.
- Se conservan las pruebas de privacidad y se detectan las mutaciones de tiempo y de clasificación de ataques.
- Se miran las animaciones en navegador real con dos jugadores, imágenes reales y reducir movimiento; se revisan tamaños y contraste en los cuatro temas/modos.
- Claude revisa el PR antes de que Marco lo fusione. Este documento no da por realizadas esas comprobaciones.
