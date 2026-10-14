# Mapbox Traffic

Verfolgen Sie die Fahrzeit Ihrer üblichen Strecken (Zuhause → Arbeit, Schule…)
mit Echtzeit-Verkehr, sehen Sie sie als Diagramm und lassen Sie sich bei Staus
oder ungewöhnlich langen Fahrten benachrichtigen. Die Daten stammen aus der
[Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
(Profil `driving-traffic`).

## Was Sie bekommen

Ein Gerät **Strecke** pro konfigurierter Strecke (bis zu 3), mit:

| Funktion         | Beschreibung                                                         |
| ---------------- | -------------------------------------------------------------------- |
| Fahrzeit         | Dauer mit dem aktuellen Verkehr, in Minuten (im Verlauf gespeichert) |
| Übliche Fahrzeit | Typische Dauer zu dieser Zeit der Woche laut Mapbox                  |
| Verspätung       | Differenz zwischen beiden, in Minuten                                |
| Entfernung       | Länge der empfohlenen Strecke, in km                                 |
| Verkehrslage     | 0 flüssig, 1 zähflüssig, 2 Stau, 3 schwerer Stau                     |
| Verkehr          | Dieselbe Stufe als Text                                              |
| Über             | Die befahrenen Hauptstraßen („A86, A1“)                              |

Außerdem:

- ein **Dashboard-Widget** „Fahrzeit“: Dauer, Verspätung, Diagramm der
  aktuellen und der üblichen Fahrzeit, Verkehrszustand und eine Schaltfläche
  „Aktualisieren“;
- vier **Szenen-Auslöser**: _Stau auf einer Strecke_, _Stau aufgelöst_,
  _Ungewöhnlich lange Fahrzeit_, _Fahrzeit wieder normal_;
- eine **Szenen-Aktion** _Fahrzeit einer Strecke abrufen_, z. B. um jeden
  Morgen „32 min (+7 min) · Zähflüssig“ zu senden.

## Einrichtung

1. Erstellen Sie ein kostenloses Konto auf [mapbox.com](https://account.mapbox.com/)
   und kopieren Sie Ihr **öffentliches Standard-Zugriffstoken** (es beginnt mit
   `pk.`). Der kostenlose Tarif enthält 100.000 Routenanfragen pro Monat.
2. Fügen Sie das Token im Reiter **Konfiguration** der Integration ein.
3. Füllen Sie mindestens **Strecke 1** aus:
   - **Name**: zum Beispiel „Arbeit“;
   - **Start**: leer lassen, um vom in Gladys festgelegten Standort des Hauses
     loszufahren (Einstellungen → Häuser), oder eine Adresse bzw. Koordinaten
     eingeben;
   - **Ziel**: eine Adresse oder Koordinaten „Breitengrad, Längengrad“
     („48.8924, 2.2369“, wie mit einem Rechtsklick aus Google Maps kopiert);
   - **Fahren über** (optional): standardmäßig nimmt Mapbox den schnellsten
     Weg. Um _Ihrem_ Weg zu folgen, geben Sie einen oder mehrere Orte in der
     gewünschten Reihenfolge an, getrennt durch `;` (bis zu 3): eine Brücke,
     eine Stadt, einen Punkt auf Ihrer Straße… Zum Beispiel
     `Pont de Normandie; 49.4431, 0.3601`. Wählen Sie Punkte **auf** der
     gewünschten Straße (nicht daneben), sonst macht Mapbox einen Umweg, um
     sie zu erreichen. Das kostet keine zusätzliche Anfrage.
4. Klicken Sie auf **Mapbox testen**: die aktuelle Fahrzeit von Strecke 1 wird
   unter der Schaltfläche angezeigt.
5. Öffnen Sie den Reiter **Erkennung** und fügen Sie Ihre Strecken hinzu.

### Aktualisierung

- **Intervall**: standardmäßig 300 s (mindestens 60 s).
- **Aktive Tage** / **Aktive Stunden**: Mapbox nur abfragen, wenn es darauf
  ankommt, z. B. Montag bis Freitag, `07:00-09:30, 16:30-19:00`. Leer bedeutet
  immer. Die Stunden gelten in der konfigurierten **Zeitzone**
  (standardmäßig `Europe/Paris`).
- **Vermeiden**: Mautstraßen, Autobahnen, Fähren.

### Kostenloser Mapbox-Tarif

Die Directions-API enthält **100.000 kostenlose Anfragen pro Monat**; darüber
hinaus berechnet Mapbox die zusätzlichen Anfragen (siehe die
[Mapbox-Preise](https://www.mapbox.com/pricing#directions-api)). Die
Integration stellt bei jeder Aktualisierung eine Anfrage pro Strecke und
geokodiert jede Adresse nur einmal. Monatlicher Verbrauch ≈ Strecken ×
Aktualisierungen pro Stunde × aktive Stunden pro Tag × Tage.

Zum Beispiel verbrauchen 3 Strecken, die alle 5 Minuten während 5 Stunden an
jedem Werktag aktualisiert werden, etwa 4.000 Anfragen pro Monat, und etwa
26.000, wenn sie den ganzen Tag aktualisiert werden: beides bleibt im
kostenlosen Tarif. 3 Strecken jede Minute rund um die Uhr zu aktualisieren
verbraucht etwa 130.000 Anfragen und überschreitet ihn.

Ihren tatsächlichen Verbrauch sehen Sie in Ihrem
[Mapbox-Konto](https://account.mapbox.com/).

### Warnungen

- **Stau**: mindestens 10 % (einstellbar) der Strecke sind laut Mapbox stark
  verstopft, oder die Fahrt ist deutlich länger als üblich (+35 %).
- **Ungewöhnlich lang**: die Fahrzeit überschreitet die übliche um 30 %
  **und** um mindestens 5 Minuten (beides einstellbar), sodass eine kurze
  Fahrt, die von 4 auf 6 Minuten steigt, keine Warnung auslöst.

## Szenen-Beispiele

- **Stauwarnung**: Auslöser _Stau auf einer Strecke_ (Strecke „Arbeit“),
  Aktion „Nachricht senden“: `Stau zur Arbeit: {{triggerEvent.data.summary}}`.
- **Morgendliche Übersicht**: werktags um 7 Uhr die Aktion _Fahrzeit einer
  Strecke abrufen_, dann „Nachricht senden“ mit der Variable _Zusammenfassung_
  (oder _Fahrzeit (min)_) der vorherigen Aktion.
- **Persönliche Schwelle**: die Strecke ist ein normales Gladys-Gerät, daher
  funktioniert auch der native Auslöser „Gerätewert“:
  „wenn Fahrzeit (Arbeit) > 45“.

Ereignis-Auslöser werden nur bei einer **Änderung** ausgelöst (ein einziges
„Stau“, solange der Stau andauert).

## Fehlerbehebung

- **„Mapbox refused the access token“**: prüfen Sie das Token auf
  [account.mapbox.com](https://account.mapbox.com/access-tokens/).
- **Adresse nicht gefunden**: verwenden Sie eine vollständigere Adresse oder
  Koordinaten.
- **„the home has no location“**: legen Sie den Standort des Hauses in Gladys
  fest, oder füllen Sie den Start aus.
- Die Logs der Integration (Reiter Logs, oder `docker logs`) beschreiben jede
  Aktualisierung; setzen Sie `LOG_LEVEL=debug`, um die Anfragen zu sehen (das
  Token wird maskiert).
