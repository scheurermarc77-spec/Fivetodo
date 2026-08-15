# FiveTodo – Version ohne Benachrichtigungen

Diese Version enthält den ursprünglichen FiveTodo-Stand ohne Push-/Benachrichtigungsfunktion.

Enthalten:
- 5 Tage: Vorgestern bis Übermorgen
- 10 Todos pro Tag
- gemeinsame Live-Synchronisation über Firebase / Firestore
- Bravo-Einblendung nach dem Erledigen
- PWA / Home-Bildschirm-Icon
- Offline-Cache über Service Worker

Nicht enthalten:
- Push-Benachrichtigungen
- Cloudflare-Worker für Push
- pushTokens
- Firebase Cloud Messaging


## Neue-Aufgaben-Anzeige

Diese Version merkt sich auf jedem iPhone lokal, wann FiveTodo zuletzt geöffnet wurde.

Wird danach auf einem anderen Gerät eine neue Aufgabe eingetragen:
- erscheint beim nächsten Öffnen oben z. B. „1 neue Aufgabe seit deinem letzten Besuch“
- die betreffende Aufgabe erhält ein kleines „NEU“-Label
- es werden weiterhin keine Push-Mitteilungen verwendet

Wichtig:
- Nur Aufgaben, die mit dieser neuen Version erstellt werden, besitzen einen Erstellzeitpunkt.
- Bereits bestehende alte Aufgaben werden beim ersten Start nicht fälschlich als neu markiert.


## Korrektur v2
Die Neue-Aufgaben-Erkennung wird nun auch ausgeführt, wenn FiveTodo auf dem iPhone nur aus dem Hintergrund
wieder geöffnet wird. Ein kompletter Neustart der PWA ist nicht mehr nötig.


## Anpassung v3
- Neue Aufgaben werden deutlich auffälliger markiert: kräftiger Rahmen, stärkeres NEU-Label und dezente Puls-Animation.
- Das BRAVO wird nur noch 0.5 Sekunden angezeigt.


## Anpassung v4
- Vorgestern entfernt.
- Standardreihenfolge: Heute, Morgen, Übermorgen.
- Bei Heute gibt es einen Button „← Gestern“, der die gestrige Liste ein-/ausblendet.
- Neue Aufgaben erhalten einen deutlich sichtbaren roten Rahmen und ein rotes „NEU“-Label.
- BRAVO leuchtet nur noch ganz kurz auf (ca. 0,18 Sekunden).


## Leon / Anouk
Beim Start erscheint eine Personenauswahl.

- Leon verwendet weiterhin die bestehende Sammlung `days`.
- Anouk verwendet die neue, getrennte Sammlung `anoukDays`.
- Über „Wechseln“ gelangt man jederzeit zurück zur Auswahl.


## Finale Leon-/Anouk-Speicherung
Leon und Anouk verwenden beide die bereits funktionierende Firestore-Sammlung `days`.

- Leon: Dokumente wie `2026-08-15`
- Anouk: Dokumente wie `anouk_2026-08-15`

Damit bleiben die Daten getrennt, ohne neue Firebase-Regeln.


## Ersteller einer Aufgabe
Beim ersten Öffnen auf einem Gerät wird einmal gefragt: Leon, Anouk, Mami oder Papi.
Die Auswahl wird lokal auf diesem Gerät gespeichert. Bei jeder neu erstellten Aufgabe
wird automatisch der Ersteller mitgespeichert und unter der Aufgabe angezeigt.


## Erledigt-Zeit
Beim Abhaken wird automatisch die Uhrzeit gespeichert und unter der Aufgabe angezeigt, z. B. `erledigt um 19:24 Uhr`. Wird der Haken entfernt, wird die Erledigt-Zeit zurückgesetzt.
