FiveTodo – automatische Übertragung verspäteter Aufgaben

UPLOAD
1. In deinem GitHub-Repository Fivetodo die bestehende Datei app.js öffnen.
2. app.js durch die beigefügte neue app.js ersetzen.
3. Commit changes bestätigen.
4. Danach die FiveTodo-App auf dem iPhone vollständig schliessen und neu öffnen.

NEU
- Nicht erledigte Aufgaben eines vergangenen Tages werden auf den Folgetag übertragen.
- Übertragene Aufgaben werden wie neue Aufgaben behandelt.
- Zusätzlich erscheint die Markierung VERSPÄTET und oben ein Verspätet-Banner.
- Sobald die Aufgabe erledigt ist, verschwindet die Verspätet-Darstellung und die Aufgabe sieht wie jede andere erledigte Aufgabe aus.
- Bleibt die App über Mitternacht geöffnet, wird um Mitternacht automatisch übertragen.
- War die App geschlossen, wird die Übertragung beim nächsten Öffnen/Zurückkehren nachgeholt.
- Die Lösung verwendet weiterhin Firestore und benötigt keine kostenpflichtige Firebase Function.

HINWEIS
Pro Tagesliste sind weiterhin maximal 10 Aufgaben vorgesehen. Sind am Folgetag alle 10 Plätze bereits belegt, bleiben überzählige Aufgaben vorerst am alten Tag und werden beim nächsten Prüfen erneut übertragen, sobald Platz vorhanden ist.
