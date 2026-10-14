# Mapbox Traffic

Siga la duración de sus trayectos habituales (casa → trabajo, colegio…) con el
tráfico en tiempo real, véala en un gráfico y reciba avisos de atascos o de
trayectos anormalmente largos. Los datos proceden de la
[API Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/)
(perfil `driving-traffic`).

## Qué obtiene

Un dispositivo **trayecto** por cada trayecto configurado (hasta 3), con:

| Funcionalidad         | Descripción                                                           |
| --------------------- | --------------------------------------------------------------------- |
| Duración del trayecto | Duración con el tráfico actual, en minutos (guardada en el historial) |
| Duración habitual     | Duración típica a esta hora de la semana según Mapbox                 |
| Retraso               | Diferencia entre ambas, en minutos                                    |
| Distancia             | Longitud de la ruta recomendada, en km                                |
| Nivel de tráfico      | 0 fluido, 1 lento, 2 atasco, 3 atasco grave                           |
| Tráfico               | El mismo nivel en texto                                               |
| Por                   | Las carreteras principales tomadas («A86, A1»)                        |

Además:

- un **widget de panel** «Duración del trayecto»: duración, retraso, gráfico de
  la duración actual frente a la habitual, estado del tráfico y un botón
  «Actualizar»;
- cuatro **disparadores de escena**: _Atasco en un trayecto_, _Fin del
  atasco_, _Duración del trayecto anormalmente larga_, _Duración del trayecto
  de nuevo normal_;
- una **acción de escena** _Obtener la duración de un trayecto_, por ejemplo
  para enviar cada mañana «32 min (+7 min) · Lento».

## Configuración

1. Cree una cuenta gratuita en [mapbox.com](https://account.mapbox.com/) y
   copie su **token de acceso público predeterminado** (empieza por `pk.`). El
   plan gratuito incluye 100 000 solicitudes de rutas al mes.
2. En la pestaña **Configuración** de la integración, pegue el token.
3. Rellene al menos el **trayecto 1**:
   - **Nombre**: por ejemplo «Trabajo»;
   - **Origen**: déjelo vacío para salir de la ubicación de la casa definida
     en Gladys (Ajustes → Casas), o escriba una dirección o unas coordenadas;
   - **Destino**: una dirección o unas coordenadas «latitud, longitud»
     («48.8924, 2.2369», copiadas de Google Maps con un clic derecho);
   - **Pasar por** (opcional): por defecto Mapbox sigue el camino más rápido.
     Para seguir _su_ camino, indique uno o varios lugares de paso, en orden,
     separados por `;` (hasta 3): un puente, una ciudad, un punto de la
     carretera que toma… Por ejemplo `Pont de Normandie; 49.4431, 0.3601`.
     Elija puntos **sobre** la carretera deseada (no al lado), o Mapbox dará
     un rodeo para alcanzarlos. No cuesta ninguna solicitud adicional.
4. Haga clic en **Probar Mapbox**: la duración actual del trayecto 1 aparece
   bajo el botón.
5. Abra la pestaña **Descubrimiento** y añada sus trayectos.

### Actualización

- **Intervalo**: 300 s por defecto (60 s como mínimo).
- **Días activos** / **Horas activas**: consultar Mapbox solo cuando importa,
  por ejemplo de lunes a viernes, `07:00-09:30, 16:30-19:00`. Vacío significa
  siempre. Las horas se leen en la **zona horaria** configurada
  (`Europe/Paris` por defecto).
- **Evitar**: peajes, autopistas, ferris.

### Plan gratuito de Mapbox

La API Directions incluye **100 000 solicitudes gratuitas al mes**; por
encima, Mapbox factura las solicitudes adicionales (consulte los
[precios de Mapbox](https://www.mapbox.com/pricing#directions-api)). La
integración hace una solicitud por trayecto en cada actualización y geocodifica
cada dirección una sola vez. Consumo mensual ≈ trayectos × actualizaciones por
hora × horas activas por día × días.

Por ejemplo, 3 trayectos actualizados cada 5 minutos durante 5 horas cada día
laborable consumen unas 4000 solicitudes al mes, y unas 26 000 si se
actualizan todo el día: ambos casos quedan dentro del plan gratuito. Actualizar
3 trayectos cada minuto, 24 h/24, consume unas 130 000 solicitudes y lo supera.

Su consumo real se muestra en su [cuenta de Mapbox](https://account.mapbox.com/).

### Alertas

- **Atasco**: al menos el 10 % (configurable) de la distancia tiene tráfico
  denso según Mapbox, o el trayecto es claramente más largo de lo habitual
  (+35 %).
- **Anormalmente largo**: la duración supera la habitual en un 30 % **y** en
  al menos 5 minutos (ambos configurables), de modo que un trayecto corto que
  pasa de 4 a 6 minutos no genera alerta.

## Ejemplos de escenas

- **Alerta de atasco**: disparador _Atasco en un trayecto_ (trayecto
  «Trabajo»), acción «Enviar un mensaje»:
  `Atasco hacia el trabajo: {{triggerEvent.data.summary}}`.
- **Resumen matinal**: a las 7 h los días laborables, acción _Obtener la
  duración de un trayecto_, y después «Enviar un mensaje» con la variable
  _Resumen_ (o _Duración del trayecto (min)_) producida por la acción
  anterior.
- **Umbral personal**: el trayecto es un dispositivo estándar de Gladys, así
  que el disparador nativo «Valor de un dispositivo» también funciona:
  «cuando Duración del trayecto (Trabajo) > 45».

Los disparadores de eventos solo se activan con un **cambio** (un único
«Atasco» mientras dura el atasco).

## Solución de problemas

- **«Mapbox refused the access token»**: compruebe el token en
  [account.mapbox.com](https://account.mapbox.com/access-tokens/).
- **Dirección no encontrada**: use una dirección más completa, o unas
  coordenadas.
- **«the home has no location»**: defina la ubicación de la casa en Gladys, o
  rellene el origen.
- Los registros de la integración (pestaña Registros, o `docker logs`)
  detallan cada actualización; defina `LOG_LEVEL=debug` para ver las
  solicitudes (el token queda oculto).
