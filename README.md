# FiveTodo – gemeinsame iPhone-To-do-App

Die App zeigt immer automatisch:
- Vorgestern
- Gestern
- Heute
- Morgen
- Übermorgen

Je Tag gibt es 10 To-dos. Nach dem Abhaken erscheint für 3 Sekunden ein animiertes "BRAVO!".
Alle verbundenen iPhones sehen dieselben Einträge nahezu in Echtzeit.

## Einmalige Einrichtung

### 1. Firebase-Projekt erstellen
1. https://console.firebase.google.com/ öffnen
2. "Projekt hinzufügen"
3. Im Projekt auf das Web-Symbol `</>` klicken und eine Web-App registrieren
4. Die angezeigte `firebaseConfig` kopieren
5. Datei `firebase-config.js` öffnen und die 6 Werte einsetzen

### 2. Firestore aktivieren
1. In Firebase links "Firestore Database"
2. Datenbank erstellen
3. Standort auswählen
4. Danach "Regeln" öffnen
5. Inhalt aus `firestore.rules` einsetzen und veröffentlichen

Hinweis: Die mitgelieferten Regeln sind bewusst sehr einfach, damit die drei iPhones ohne Login sofort gemeinsam arbeiten können.
Jeder, der die Webadresse kennt, könnte dadurch theoretisch auf die Daten zugreifen. Für private Nutzung kann später ein Login ergänzt werden.

### 3. Dateien hochladen
Alle Dateien und Ordner so wie sie sind auf einen HTTPS-Webserver hochladen, z.B. GitHub Pages, Netlify, Firebase Hosting oder euren eigenen Webserver.

Wichtig: `index.html`, `app.js`, `styles.css`, `firebase-config.js`, `sw.js`, `manifest.webmanifest` und der Ordner `icons` müssen gemeinsam hochgeladen werden.

### 4. Auf jedem iPhone installieren
1. Die Webadresse in Safari öffnen
2. Teilen-Symbol
3. "Zum Home-Bildschirm"
4. "Hinzufügen"

Danach verhält sich die Seite wie eine App.

## Gemeinsame Nutzung
Einfach dieselbe Webadresse auf allen 3 iPhones installieren. Es braucht keine separate Synchronisation.
