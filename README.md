# EaV-oglijESptta
Piccolo frontend dedicato per i treni eav. Per ora focalizzato sulla circumvesuviana in quanto colori delle linee e alcuni dettagli li conosco a memoria.

Al momento si appoggia ad un worker clodflare per bypassare le CORS del browser, quindi le richieste sono limitate a 100.000 al giorno, con un picco di 1000 al minuto. 
Una ogni *10 secondi, 6 al minuto* , se usato con parsimonia può essere usato da migliaia di utenti al giorno, quasi 200 alla volta. **Attivare la modalità live solo quando necessario!** 
Se qualcuno creasse un endpoint migliore, se arrivassero due spicci per aumentare il throughput, o se eav autorizzasse le github pages, non sarebbe male. 

Si ringrazia Claudio de' Codici per aver permesso la rapida prototipazione.


