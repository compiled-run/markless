// Written by packages/mobile/test/write-validation-messages.ts from Chromium 156.0.8078.4; do not edit.

import type { NativeNumberMessages, NativeTooLong } from './native-view.ts';

/** Chromium's `validationMessage` for a required field with no value, by the language Chromium shows its own text in. */
export const NATIVE_VALUE_MISSING_BY_LOCALE: Readonly<
	Record<string, { readonly text: string; readonly checkbox: string; readonly radio: string }>
> = {
	af: {
		text: 'Vul asseblief hierdie veld in.',
		checkbox: 'Merk asseblief hierdie blokkie as jy wil voortgaan.',
		radio: 'Kies asseblief een van hierdie opsies.',
	},
	am: {
		text: 'እባክዎ ይህን መስክ ይሙሉት።',
		checkbox: 'ለመቀጠል ከፈለጉ እባክዎ ይህ ሳጥን ላይ ምልክት ያድርጉ።',
		radio: 'እባክዎ ከእነዚህ አማራጮች ውስጥ አንዱን ይምረጡ።',
	},
	ar: {
		text: 'يُرجى ملء هذا الحقل.',
		checkbox: 'يُرجى وضع علامة في هذا المربع إذا أردت المتابعة.',
		radio: 'يُرجى اختيار أحد هذه الخيارات.',
	},
	bg: {
		text: 'Моля, попълнете това поле.',
		checkbox: 'Моля, поставете отметка в това квадратче, ако искате да продължите.',
		radio: 'Моля, изберете една от тези опции.',
	},
	bn: {
		text: 'দয়া করে এই ক্ষেত্রটি পূরণ করুন৷',
		checkbox: 'আপনি এগিয়ে যেতে চাইলে এই বাক্সটি পরীক্ষা করুন৷',
		radio: 'দয়া করে বিকল্পগুলির একটি নির্বাচন করুন৷',
	},
	ca: {
		text: 'Empleneu aquest camp.',
		checkbox: 'Marqueu aquesta casella si voleu continuar.',
		radio: "Seleccioneu una d'aquestes opcions.",
	},
	cs: {
		text: 'Vyplňte prosím toto pole.',
		checkbox: 'Chcete-li pokračovat, zaškrtněte toto políčko.',
		radio: 'Vyberte jednu z těchto možností.',
	},
	da: {
		text: 'Udfyld dette felt.',
		checkbox: 'Markér dette felt, hvis du vil fortsætte.',
		radio: 'Vælg en af disse muligheder.',
	},
	de: {
		text: 'Fülle dieses Feld aus.',
		checkbox: 'Klicke dieses Kästchen an, wenn du fortfahren möchtest.',
		radio: 'Wähle eine dieser Optionen aus.',
	},
	el: {
		text: 'Συμπληρώστε αυτό το πεδίο.',
		checkbox: 'Αν θέλετε να συνεχίσετε, επιλέξτε αυτό το πλαίσιο.',
		radio: 'Ορίστε μία από αυτές τις επιλογές.',
	},
	en: {
		text: 'Please fill out this field.',
		checkbox: 'Please check this box if you want to proceed.',
		radio: 'Please select one of these options.',
	},
	'en-GB': {
		text: 'Please fill in this field.',
		checkbox: 'Please tick this box if you want to proceed.',
		radio: 'Please select one of these options.',
	},
	es: {
		text: 'Completa este campo',
		checkbox: 'Selecciona esta casilla de verificación si quieres continuar',
		radio: 'Selecciona una de estas opciones',
	},
	'es-419': {
		text: 'Completa este campo',
		checkbox: 'Controla esta casilla si deseas continuar.',
		radio: 'Selecciona una de estas opciones.',
	},
	et: {
		text: 'Täitke see väli.',
		checkbox: 'Märkige see ruut, kui soovite jätkata.',
		radio: 'Tehke üks nendest valikutest.',
	},
	fa: {
		text: 'لطفاً این قسمت را تکمیل کنید.',
		checkbox: 'درصورتی‌که می‌خواهید ادامه دهید، این کادر را انتخاب کنید.',
		radio: 'لطفاً یکی از این گزینه‌ها را انتخاب کنید.',
	},
	fi: {
		text: 'Täytä tämä kenttä.',
		checkbox: 'Valitse tämä ruutu jatkaaksesi.',
		radio: 'Valitse yksi vaihtoehdoista.',
	},
	fil: {
		text: 'Pakipunan ang field na ito.',
		checkbox: 'Pakitingnan ang kahon na ito kung gusto mong magpatuloy.',
		radio: 'Mangyaring pumili ng isa sa mga opsyong ito.',
	},
	fr: {
		text: 'Veuillez renseigner ce champ.',
		checkbox: 'Veuillez cocher cette case si vous souhaitez continuer.',
		radio: "Veuillez sélectionner l'une de ces options.",
	},
	gu: {
		text: 'કૃપા કરીને આ ફીલ્ડ ભરો.',
		checkbox: 'જો તમે આગળ વધવા માંગતા હો તો કૃપા કરીને આ બૉક્સને ચેક કરો.',
		radio: 'કૃપા કરીને આ વિકલ્પોમાંથી કોઈ એક પસંદ કરો.',
	},
	he: {
		text: 'זהו שדה חובה.',
		checkbox: 'יש לסמן את התיבה הזאת כדי להמשיך.',
		radio: 'יש לבחור אחת מהאפשרויות הבאות.',
	},
	hi: {
		text: 'कृपया इस फ़ील्ड को भरें.',
		checkbox: 'अगर आप आगे बढ़ना चाहते हैं तो इस बॉक्‍स को सही का निशान लगाकर चुनें.',
		radio: 'कृपया इनमें से कोई विकल्प चुनें.',
	},
	hr: {
		text: 'Ispunite ovo polje.',
		checkbox: 'Označite taj okvir ako želite ići dalje.',
		radio: 'Izaberite jednu od tih opcija.',
	},
	hu: {
		text: 'Kérjük, töltse ki ezt a mezőt.',
		checkbox: 'Kérjük, jelölje be ezt a jelölőnégyzetet, ha tovább kíván haladni.',
		radio: 'Kérjük, válassza ki az egyik opciót.',
	},
	id: {
		text: 'Harap isi bidang ini.',
		checkbox: 'Centang kotak ini jika Anda ingin melanjutkan.',
		radio: 'Pilih salah satu opsi berikut.',
	},
	it: {
		text: 'Compila questo campo.',
		checkbox: 'Seleziona questa casella se intendi procedere.',
		radio: 'Seleziona una di queste opzioni.',
	},
	ja: {
		text: 'このフィールドを入力してください。',
		checkbox: '次に進むにはこのチェックボックスをオンにしてください。',
		radio: 'これらのオプションから 1 つ選択してください。',
	},
	kn: {
		text: 'ದಯವಿಟ್ಟು ಈ ಕ್ಷೇತ್ರವನ್ನು ಭರ್ತಿ ಮಾಡಿ.',
		checkbox: 'ನೀವು ಮುಂದುವರೆಯಬೇಕಾದರೆ ದಯವಿಟ್ಟು ಈ ಬಾಕ್ಸ್ ಅನ್ನು ಪರೀಕ್ಷಿಸಿ.',
		radio: 'ದಯವಿಟ್ಟು ಈ ಕೆಳಗಿನ ಆಯ್ಕೆಗಳಲ್ಲಿ ಒಂದನ್ನು ಆರಿಸಿ.',
	},
	ko: {
		text: '이 입력란을 작성하세요.',
		checkbox: '계속하려면 이 확인란을 선택하세요.',
		radio: '다음 옵션 중 하나를 선택하세요.',
	},
	lt: {
		text: 'Užpildykite šį lauką.',
		checkbox: 'Jei norite tęsti, pažymėkite šį laukelį.',
		radio: 'Pasirinkite vieną iš šių parinkčių.',
	},
	lv: {
		text: 'Aizpildiet šo lauku.',
		checkbox: 'Lai turpinātu, atzīmējiet šo izvēles rūtiņu.',
		radio: 'Lūdzu, atlasiet vienu no šīm opcijām.',
	},
	ml: {
		text: 'ദയവായി ഈ ഫീല്‍ഡ് പൂരിപ്പിക്കുക.',
		checkbox: 'നിങ്ങള്‍ തുടരാന്‍ താല്‍പ്പര്യപ്പെടുന്നെങ്കില്‍ ഈ ബോക്സ് ദയവായി പരിശോധിക്കുക.',
		radio: 'ഈ ഓപ്ഷനുകളിലൊന്ന് ദയവായി തിരഞ്ഞെടുക്കുക.',
	},
	mr: {
		text: 'कृपया हे फील्ड भरा.',
		checkbox: 'कृपया तुम्ही पुढे सुरू ठेवू इच्छित असल्यास हा बॉक्स पहा.',
		radio: 'कृपया या पर्यायांपैकी एक निवडा.',
	},
	ms: {
		text: 'Sila isikan medan ini.',
		checkbox: 'Sila tandakan kotak ini jika anda mahu teruskan.',
		radio: 'Sila pilih salah satu pilihan ini.',
	},
	nb: {
		text: 'Vennligst fyll ut dette feltet.',
		checkbox: 'Kryss av denne boksen hvis du vil fortsette.',
		radio: 'Velg ett av følgende alternativer.',
	},
	nl: {
		text: 'Vul dit veld in.',
		checkbox: 'Vink dit selectievakje aan als je wilt doorgaan.',
		radio: 'Selecteer een van deze opties.',
	},
	pl: {
		text: 'Wypełnij to pole.',
		checkbox: 'Zaznacz to pole, jeśli chcesz kontynuować.',
		radio: 'Wybierz jedną z opcji.',
	},
	'pt-BR': {
		text: 'Preencha este campo.',
		checkbox: 'Marque esta caixa se deseja continuar.',
		radio: 'Selecione uma das opções.',
	},
	'pt-PT': {
		text: 'Preencha este campo.',
		checkbox: 'Selecione esta caixa se pretender continuar.',
		radio: 'Selecione uma destas opções.',
	},
	ro: {
		text: 'Completează acest câmp.',
		checkbox: 'Bifeză caseta dacă vrei să continui.',
		radio: 'Selectează una dintre aceste opțiuni.',
	},
	ru: {
		text: 'Заполните это поле.',
		checkbox: 'Чтобы продолжить, установите этот флажок.',
		radio: 'Выберите один из вариантов.',
	},
	sk: {
		text: 'Vyplňte toto pole.',
		checkbox: 'Ak chcete pokračovať, začiarknite toto políčko.',
		radio: 'Vyberte jednu z týchto možností.',
	},
	sl: {
		text: 'Izpolnite to polje',
		checkbox: 'Potrdite to polje, če želite nadaljevati.',
		radio: 'Izberite eno od teh možnosti.',
	},
	sr: {
		text: 'Попуните ово поље.',
		checkbox: 'Потврдите избор у овом пољу за потврду уколико желите да наставите.',
		radio: 'Изаберите неку од ових опција.',
	},
	sv: {
		text: 'Fyll i det här fältet.',
		checkbox: 'Markera den här kryssrutan om du vill fortsätta.',
		radio: 'Välj ett av följande alternativ.',
	},
	sw: {
		text: 'Tafadhali jaza sehemu hii.',
		checkbox: 'Tafadhali angalia kikasha hiki iwapo unataka kuendelea.',
		radio: 'Tafadhali chagua moja wapo ya chaguo hizi.',
	},
	ta: {
		text: 'இந்தப் புலத்தை நிரப்புக.',
		checkbox: 'தொடர விரும்பினால், இந்தப் பெட்டியைத் தேர்ந்தெடுங்கள்.',
		radio: 'தயவுசெய்து இந்த விருப்பங்களில் ஒன்றைத் தேர்ந்தெடுங்கள்.',
	},
	te: {
		text: 'దయచేసి ఈ ఫీల్డ్‌ను పూర్తి చేయండి.',
		checkbox: 'మీరు కొనసాగాలనుకుంటే దయచేసి ఈ బాక్స్‌కి టిక్కు పెట్టండి.',
		radio: 'దయచేసి ఈ ఎంపికలలో ఒకదాన్ని ఎంచుకోండి.',
	},
	th: {
		text: 'โปรดกรอกฟิลด์นี้',
		checkbox: 'โปรดเลือกช่องนี้หากคุณต้องการดำเนินการต่อ',
		radio: 'โปรดเลือกตัวเลือกอย่างหนึ่งอย่างใดเหล่านี้',
	},
	tr: {
		text: 'Lütfen bu alanı doldurun.',
		checkbox: 'İlerlemek istiyorsanız lütfen bu kutuyu işaretleyin.',
		radio: 'Lütfen bu seçeneklerden birini belirleyin.',
	},
	uk: {
		text: 'Заповніть це поле.',
		checkbox: 'Поставте тут прапорець, якщо хочете продовжити.',
		radio: 'Виберіть один із запропонованих варіантів.',
	},
	ur: {
		text: 'براہ کرم یہ فیلڈ پُر کریں۔',
		checkbox: 'اگر آپ آگے بڑھنا چاہتے ہیں تو براہ کرم یہ باکس نشان زد کریں۔',
		radio: 'براہ کرم ان اختیارات میں سے ایک کو منتخب کریں۔',
	},
	vi: {
		text: 'Vui lòng điền vào trường này.',
		checkbox: 'Vui lòng chọn hộp kiểm này nếu bạn muốn tiếp tục.',
		radio: 'Vui lòng chọn một trong các tùy chọn sau.',
	},
	'zh-CN': {
		text: '请填写此字段。',
		checkbox: '如果要继续，请选中此框。',
		radio: '请从这些选项中选择一个。',
	},
	'zh-TW': {
		text: '請填寫這個欄位。',
		checkbox: '如果你要繼續執行，請勾選這個核取方塊。',
		radio: '請選取其中一個選項。',
	},
};

/** Chromium's `validationMessage` for a text field a person edited to longer than its maxlength, with `{max}` and `{length}` for the numbers. */
export const NATIVE_TOO_LONG_BY_LOCALE: Readonly<Record<string, NativeTooLong>> = {
	af: {
		text: 'Verkort hierdie teks na {max} karakters of minder (jy gebruik tans {length} karakters).',
	},
	am: {
		text: 'እባክዎ ይህ ጽሁፍ ወደ {max} ወይም ከዚያ በታች ቁምፊዎች ያሳጥሩት (በአሁኑ ጊዜ {length} ቁምፊዎችን እየተጠቀሙ ነዎት)።',
	},
	ar: {
		text: 'يُرجى اختصار هذا النص حتى يصل إلى {max} من الحروف أو أقل (أنت الآن تستخدم {length} من الحروف).',
	},
	bg: {
		text: 'Моля, съкратете този текст до {max} знака или по-малко (понастоящем използвате {length} знака).',
	},
	bn: {
		text: 'দয়া করে এই পাঠ্যটি {max}টি অক্ষর বা তার কমে (আপনি বর্তমানে {length}টি অক্ষর ব্যবহার করছেন) সংক্ষিপ্ত করুন৷',
	},
	ca: {
		text: "Escurceu aquest text a un màxim de {max} caràcters (ara n'esteu utilitzant {length}).",
	},
	cs: {
		text: 'Zkraťte prosím tento text na {max} znaků nebo méně. (Aktuálně má {length} znaků.)',
	},
	da: {
		text: 'Forkort denne tekst til {max} tegn eller færre (du bruger i øjeblikket {length} tegn).',
	},
	de: {
		text: 'Kürze diesen Text auf max. {max} Zeichen. Zurzeit verwendest du {length} Zeichen.',
	},
	el: {
		text: 'Κάντε πιο σύντομο αυτό το κείμενο ώστε να έχει το πολύ {max} χαρακτήρες (αυτήν τη στιγμή χρησιμοποιείτε {length} χαρακτήρες).',
	},
	en: {
		text: 'Please shorten this text to {max} characters or less (you are currently using {length} characters).',
	},
	'en-GB': {
		text: 'Please shorten this text to {max} characters or less (you are currently using {length} characters).',
	},
	es: {
		text: 'Reduce la longitud de este texto a {max} caracteres o menos (actualmente, el texto tiene {length} caracteres)',
	},
	'es-419': {
		text: 'Acorta este texto a {max} caracteres o menos (actualmente estás usando {length} caracteres).',
	},
	et: {
		text: 'Lühendage seda teksti {max} tähemärgini või rohkem (praegu kasutate {length} tähemärki).',
	},
	fa: {
		text: 'لطفاً این متن را به اندازه {max} نویسه یا کمتر کوتاه کنید (شما در حال حاضر از {length} نویسه استفاده می‌کنید).',
		digits: '۰۱۲۳۴۵۶۷۸۹',
	},
	fi: {
		text: 'Lyhennä tämä teksti alle {max} merkkiin (tällä hetkellä käytössä {length} merkkiä).',
	},
	fil: {
		text: 'Mangyaring paikliin ang tekstong ito ng {max} (na) character o mas mababa (kasalukuyan kang gumagamit ng {length} (na) character).',
	},
	fr: {
		text: 'Veuillez réduire ce texte à {max} caractères maximum (il compte actuellement {length} caractères).',
	},
	gu: {
		text: 'કૃપા કરીને આ ટેક્સ્ટને {max} અક્ષર અથવા તેથી ઓછા સુધી નાનો કરો (તમે હાલમાં {length} અક્ષરોનો ઉપયોગ કરી રહ્યા છો).',
	},
	he: {
		text: 'צריך לקצר את הטקסט ל-{max} תווים או פחות (כרגע: {length} תווים).',
	},
	hi: {
		text: 'कृपया इस टेक्स्ट को {max} वर्णों या कम तक छोटा करें (वर्तमान में आप {length} वर्णों का उपयोग कर रहे हैं).',
	},
	hr: {
		text: 'Skratite taj tekst na {max} znakova ili manje (trenutačno upotrebljavate {length} znakova).',
	},
	hu: {
		text: 'Kérjük, rövidítse le a szöveget legfeljebb {max} karakterre (jelenleg {length} karaktert használ).',
	},
	id: {
		text: 'Pendekkan teks ini menjadi {max} karakter atau kurang (saat ini Anda menggunakan {length} karakter).',
	},
	it: {
		text: 'Riduci questo testo a {max} caratteri o meno (attualmente stai utilizzando {length} caratteri).',
	},
	ja: {
		text: 'このテキストを半角 {max} 文字以下にしてください（現時点で半角 {length} 文字です）。',
	},
	kn: {
		text: 'ದಯವಿಟ್ಟು ಈ ಪಠ್ಯವನ್ನು {max} ಅಕ್ಷರಗಳಿಗೆ ಅಥವಾ ಅದಕ್ಕಿಂತಲೂ ಕಡಿಮೆಗೆ ಸೀಮಿತಗೊಳಿಸಿ (ನೀವು ಪ್ರಸ್ತುತ {length} ಅಕ್ಷರಗಳನ್ನು ಬಳಸುತ್ತಿರುವಿರಿ).',
	},
	ko: {
		text: '이 텍스트를 {max}자 이하로 줄이세요(현재 {length}자 사용 중).',
	},
	lt: {
		text: 'Sutrumpinkite šį tekstą iki {max} simb. ar mažiau (šiuo metu naudojate {length} simb.).',
	},
	lv: {
		text: 'Lūdzu, saīsiniet šo tekstu līdz {max} vai mazāk zīmēm (pašreiz tas ietver {length} rakstzīmes).',
	},
	ml: {
		text: 'ഈ വാചകത്തെ {max} അല്ലെങ്കില്‍ അതില്‍‌ക്കുറവ് പ്രതീകങ്ങളായി ദയവായി കുറയ്ക്കുക (നിങ്ങള്‍ നിലവില്‍ {length} പ്രതീകങ്ങള്‍ ഉപയോഗിക്കുകയാണ്).',
	},
	mr: {
		text: 'कृपया हा मजकूर {max} वर्ण लहान किंवा कमी करा (तुम्ही सध्या {length} वर्ण वापरत आहात).',
	},
	ms: {
		text: 'Sila pendekkan teks ini menjadi {max} aksara atau kurang (anda kini menggunakan {length} aksara).',
	},
	nb: {
		text: 'Forkort denne teksten til {max} tegn eller færre (for øyeblikket bruker du {length} tegn).',
	},
	nl: {
		text: 'Kort deze tekst in tot {max} tekens of minder (je gebruikt momenteel {length} tekens).',
	},
	pl: {
		text: 'Skróć ten tekst do maksymalnie {max} znaków (w tej chwili korzystasz z {length} znaków).',
	},
	'pt-BR': {
		text: 'Reduza este texto para {max} caracteres ou menos (você está usando {length} caracteres).',
	},
	'pt-PT': {
		text: 'Encurte este texto para {max} caracteres ou menos (está atualmente a utilizar {length} caracteres).',
	},
	ro: {
		text: 'Micșorează acest text la cel mult {max} caractere (în prezent utilizezi {length} caractere).',
	},
	ru: {
		text: 'Длина текста не должна превышать {max} симв. (сейчас {length} симв.).',
	},
	sk: {
		text: 'Tento text musíte skrátiť na {max} znakov alebo menej (súčasný počet znakov: {length}).',
	},
	sl: {
		text: 'Skrajšajte to besedilo na {max} znakov ali manj (trenutno uporabljate {length} znakov).',
	},
	sr: {
		text: 'Скратите овај текст на {max} знак(ов)а или мање (тренутно користите {length} знак(ов)а).',
	},
	sv: {
		text: 'Förkorta texten till {max} tecken eller mindre (nu är texten {length} tecken).',
	},
	sw: {
		text: 'Tafadhali fupisha maandishi haya hadi vibambo {max} au chini (kwa sasa unatumia vibambo {length} ).',
	},
	ta: {
		text: 'இந்த உரையை {max} எழுத்துக்குறிகள் அல்லது அதற்கும் குறைவாக சுருக்கிடுங்கள் (நீங்கள் தற்போது {length} எழுத்துக்குறிகளைப் பயன்படுத்துகிறீர்கள்).',
	},
	te: {
		text: 'దయచేసి ఈ వచనాన్ని {max} అక్షరాలకు లేదా అంతకంటే తక్కువకు తగ్గించండి (మీరు ప్రస్తుతం {length} అక్షరాలను ఉపయోగిస్తున్నారు).',
	},
	th: {
		text: 'โปรดย่อข้อความนี้ให้เหลือไม่เกิน {max} อักขระ (ขณะนี้ข้อความของคุณมี {length} อักขระ)',
	},
	tr: {
		text: 'Lütfen bu metni {max} veya daha az karakter olacak şekilde kısaltın (şu anda {length} karakter kullanıyorsunuz).',
	},
	uk: {
		text: 'Скоротіть текст до такої кількості символів або менше: {max} (наразі використано символів: {length}).',
	},
	ur: {
		text: 'براہ کرم اس متن کو مختصر کر کے {max} یا اس سے کم حروف تک لائیں (آپ فی الحال {length} حروف استعمال کر رہے ہیں)۔',
	},
	vi: {
		text: 'Hãy cắt ngắn văn bản này thành {max} ký tự hoặc ít hơn (bạn hiện đang sử dụng {length} ký tự).',
	},
	'zh-CN': {
		text: '请将该文本减少为 {max} 个字符或更少（您当前使用了 {length} 个字符）。',
	},
	'zh-TW': {
		text: '請將這段文字刪減至 {max} 個字元以下 (目前的字元數為 {length} 個)。',
	},
};

/** Chromium's `validationMessage` for a number field out of its range, off its step, or holding text that is no number, with `{min}`, `{max}`, `{low}`, `{high}` and `{value}` for the numbers. */
export const NATIVE_NUMBER_MESSAGES_BY_LOCALE: Readonly<Record<string, NativeNumberMessages>> = {
	af: {
		underflow: 'Waarde moet groter as of gelyk aan {min} wees.',
		overflow: 'Waarde moet minder as of gelyk aan {max} wees.',
		step: "Voer asseblief 'n geldige waarde in. Die twee naaste geldige waardes is {low} en {high}.",
		stepOne: "Voer asseblief 'n geldige waarde in. Die naaste geldige waarde is {value}.",
		badInput: "Voer asseblief 'n nommer in.",
		decimal: ',',
	},
	am: {
		underflow: 'ዋጋ ከ{min} የሚበልጥ ወይም ከእሱ እኩል መሆን አለበት።',
		overflow: 'ዋጋ ከ{max} የሚያንስ ወይም ከእሱ እኩል መሆን አለበት።',
		step: 'እባክዎ የሚሰራ ዋጋ ያስገቡ። ሁለቱ የሚቀርቡ ዋጋዎች {low} እና {high} ናቸው።',
		stepOne: 'እባክዎ የሚሰራ ዋጋ ያስገቡ። የሚቀርበው ዋጋ {value} ነው።',
		badInput: 'እባክዎ ቁጥር ያስገቡ።',
	},
	ar: {
		underflow: 'يجب أن تكون القيمة أكبر من أو تساوي {min}.',
		overflow: 'يجب أن تكون القيمة أقل من أو تساوي {max}.',
		step: 'يُرجى إدخال قيمة صالحة. علمًا بأن القيم الصالحة تتراوح بين {low} و{high}.',
		stepOne: 'يُرجى إدخال قيمة صالحة. علمًا بأن أقرب قيمة صالحة هي {value}.',
		badInput: 'يُرجى إدخال عدد.',
	},
	bg: {
		underflow: 'Стойността трябва да е по-голяма или равна на {min}.',
		overflow: 'Стойността трябва да е по-малка или равна на {max}.',
		step: 'Моля, въведете валидна стойност. Двете най-близки такива са {low} и {high}.',
		stepOne: 'Моля, въведете валидна стойност. Най-близката такава е {value}.',
		badInput: 'Моля, въведете номер.',
		decimal: ',',
	},
	bn: {
		underflow: 'মানটি অবশ্যই {min}এর চেয়ে বেশি বা সমান হবে৷',
		overflow: 'মানটি অবশ্যই {max}এর চেয়ে কম বা সমান হবে৷',
		step: 'দয়া করে একটি বৈধ মান লিখুন৷ দুটি কাছাকাছির বৈধ মান হল {low} এবং {high}৷',
		stepOne: 'দয়া করে একটি বৈধ মান লিখুন৷ কাছাকাছির বৈধ মান হল {value}৷',
		badInput: 'দয়া করে একটি সংখ্যা লিখুন৷',
	},
	ca: {
		underflow: 'El valor ha de ser més gran o igual que {min}.',
		overflow: 'El valor ha de ser igual o inferior a {max}.',
		step: 'Introduïu un valor vàlid. Els valors vàlids més propers són {low} i {high}.',
		stepOne: 'Introduïu un valor vàlid. El valor vàlid més proper és {value}.',
		badInput: 'Introduïu un número.',
		decimal: ',',
	},
	cs: {
		underflow: 'Hodnota musí být větší nebo rovna {min}.',
		overflow: 'Hodnota musí být menší nebo rovna {max}.',
		step: 'Zadejte platnou hodnotu. Dvě nejbližší hodnoty jsou {low} a {high}.',
		stepOne: 'Zadejte platnou hodnotu. Nejbližší platná hodnota je {value}.',
		badInput: 'Zadejte prosím číslo.',
		decimal: ',',
	},
	da: {
		underflow: 'Værdien skal være større end eller lig med {min}.',
		overflow: 'Værdien skal være mindre end eller lig med {max}.',
		step: 'Angiv en gyldig værdi. De to nærmeste gyldige værdier er {low} og {high}.',
		stepOne: 'Angiv en gyldig værdi. Den nærmeste gyldige værdi er {value}.',
		badInput: 'Angiv et nummer.',
		decimal: ',',
	},
	de: {
		underflow: 'Wert muss größer als oder gleich {min} sein.',
		overflow: 'Wert muss kleiner als oder gleich {max} sein.',
		step: 'Gib einen gültigen Wert ein. Die zwei nächstliegenden gültigen Werte sind {low} und {high}.',
		stepOne: 'Gib einen gültigen Wert ein. Der nächstliegende gültige Wert ist {value}.',
		badInput: 'Gib eine Nummer ein.',
		decimal: ',',
	},
	el: {
		underflow: 'Η τιμή πρέπει να είναι μεγαλύτερη ή ίση του {min}.',
		overflow: 'Η τιμή πρέπει να είναι μικρότερη ή ίση του {max}.',
		step: 'Καταχωρίστε μια έγκυρη τιμή. Οι δύο πιο κοντινές έγκυρες τιμές είναι {low} και {high}.',
		stepOne: 'Καταχωρίστε μια έγκυρη τιμή. Η κοντινότερη έγκυρη τιμή είναι {value}.',
		badInput: 'Εισαγάγετε έναν αριθμό.',
		decimal: ',',
	},
	en: {
		underflow: 'Value must be greater than or equal to {min}.',
		overflow: 'Value must be less than or equal to {max}.',
		step: 'Please enter a valid value. The two nearest valid values are {low} and {high}.',
		stepOne: 'Please enter a valid value. The nearest valid value is {value}.',
		badInput: 'Please enter a number.',
	},
	'en-GB': {
		underflow: 'Value must be greater than or equal to {min}.',
		overflow: 'Value must be less than or equal to {max}.',
		step: 'Please enter a valid value. The two nearest valid values are {low} and {high}.',
		stepOne: 'Please enter a valid value. The nearest valid value is {value}.',
		badInput: 'Please enter a number.',
	},
	es: {
		underflow: 'El valor debe ser superior o igual a {min}',
		overflow: 'El valor debe ser inferior o igual a {max}',
		step: 'Introduce un valor válido. Los dos valores válidos más aproximados son {low} y {high}.',
		stepOne: 'Introduce un valor válido. El valor válido más aproximado es {value}.',
		badInput: 'Debes introducir un número',
		decimal: ',',
	},
	'es-419': {
		underflow: 'El valor debe ser mayor de o igual a {min}',
		overflow: 'El valor debe ser menor de o igual a {max}',
		step: 'Ingresa un valor válido. Los dos valores válidos más aproximados son {low} y {high}.',
		stepOne: 'Ingresa un valor válido. El valor válido más aproximado es {value}.',
		badInput: 'Debes ingresar un número.',
	},
	et: {
		underflow: 'Väärtus peab olema suurem või võrdne {min}-ga.',
		overflow: 'Väärtus peab olema väiksem või võrdne {max}-ga.',
		step: 'Sisestage kehtiv väärtus. Kaks lähimat kehtivat väärtust on {low} ja {high}.',
		stepOne: 'Sisestage kehtiv väärtus. Lähim kehtiv väärtus on {value}.',
		badInput: 'Sisestage arv.',
		decimal: ',',
	},
	fa: {
		underflow: 'مقدار باید بیشتر یا مساوی با {min} باشد.',
		overflow: 'مقدار باید کمتر یا برابر با {max} باشد.',
		step: 'لطفاً یک مقدار معتبر وارد کنید. نزدیک‌ترین مقادیر معتبر {low} و {high} هستند.',
		stepOne: 'لطفاً یک مقدار معتبر وارد کنید. نزدیک‌ترین مقدار معتبر {value} است.',
		badInput: 'لطفاً شماره‌ای را وارد کنید.',
		digits: '۰۱۲۳۴۵۶۷۸۹',
		decimal: '٫',
	},
	fi: {
		underflow: 'Arvon tulee olla suurempi tai yhtä suuri kuin {min}.',
		overflow: 'Arvon tulee olla pienempi tai yhtä suuri kuin {max}.',
		step: 'Syötä kelvollinen arvo. Kaksi lähintä kelvollista arvoa ovat {low} ja {high}.',
		stepOne: 'Syötä kelvollinen arvo. Lähin kelvollinen arvo on {value}.',
		badInput: 'Anna numero.',
		decimal: ',',
	},
	fil: {
		underflow: 'Dapat mas mataas kaysa sa o katumbas ng {min} ang halaga.',
		overflow: 'Dapat mas mababa kaysa sa o katumbas ng {max} ang halaga.',
		step: 'Mangyaring maglagay ng isang wastong value. Ang dalawang pinakamalapit na wastong value ay {low} at {high}.',
		stepOne:
			'Mangyaring maglagay ng isang wastong value. Ang pinakamalapit na wastong value ay {value}.',
		badInput: 'Mangyaring maglagay ng numero.',
	},
	fr: {
		underflow: 'Cette valeur doit être supérieure ou égale à {min}.',
		overflow: 'Cette valeur doit être inférieure ou égale à {max}.',
		step: 'Veuillez saisir une valeur valide. Les deux valeurs valides les plus proches sont "{low}" et "{high}".',
		stepOne:
			'Veuillez saisir une valeur valide. La valeur valide la plus proche est "{value}".',
		badInput: 'Veuillez saisir un nombre.',
		decimal: ',',
	},
	gu: {
		underflow: 'મૂલ્ય {min} જેટલું અથવા આનાથી વધુ હોવું આવશ્યક છે.',
		overflow: 'મૂલ્ય {max} જેટલું અથવા આનાથી ઓછું હોવું આવશ્યક છે.',
		step: 'કૃપા કરીને એક માન્ય મૂલ્ય દાખલ કરો. બે નિકટતમ માન્ય મૂલ્યો {low} અને {high} છે.',
		stepOne: 'કૃપા કરીને એક માન્ય મૂલ્ય દાખલ કરો. નિકટતમ માન્ય મૂલ્ય {value} છે.',
		badInput: 'કૃપા કરીને એક નંબર દાખલ કરો.',
	},
	he: {
		underflow: 'הערך חייב להיות גדול מ-{min} או שווה לו.',
		overflow: 'הערך חייב להיות קטן מ-{max} או שווה לו.',
		step: 'יש להזין ערך חוקי. שני הערכים החוקיים הקרובים ביותר הם {low} ו-{high}.',
		stepOne: 'יש להזין ערך חוקי. הערך החוקי הקרוב ביותר הוא {value}',
		badInput: 'יש להזין מספר.',
	},
	hi: {
		underflow: 'मान {min} से कम या इसके बराबर होना चाहिए.',
		overflow: 'मान {max} से कम या इसके बराबर होना चाहिए.',
		step: 'कृपया कोई मान्य मान डालें. दो निकटतम मान्य मान {low} और {high} हैं.',
		stepOne: 'कृपया कोई मान्य मान डालें. निकटतम मान्य मान {value} है.',
		badInput: 'कृपया कोई संख्या डालें.',
	},
	hr: {
		underflow: 'Vrijednost mora biti {min} ili veća.',
		overflow: 'Vrijednost mora biti {max} ili manja.',
		step: 'Unesite važeću vrijednost. Dvije su najbliže važeće vrijednosti {low} i {high}.',
		stepOne: 'Unesite važeću vrijednost. Najbliža je važeća vrijednost {value}.',
		badInput: 'Unesite broj.',
		decimal: ',',
	},
	hu: {
		underflow: 'Az érték legyen nagyobb vagy egyenlő, mint {min}.',
		overflow: 'Az érték legyen kisebb vagy egyenlő, mint {max}.',
		step: 'Kérjük, érvényes értéket adjon meg. A két legközelebbi érvényes érték {low} és {high}.',
		stepOne: 'Kérjük, érvényes értéket adjon meg. A legközelebbi érvényes érték {value}.',
		badInput: 'Kérjük, adjon meg egy számot.',
		decimal: ',',
	},
	id: {
		underflow: 'Nilai harus lebih besar daripada atau sama dengan {min}.',
		overflow: 'Nilai harus lebih kecil atau sama dengan {max}.',
		step: 'Masukkan nilai yang valid. Dua nilai valid terdekat adalah {low} dan {high}.',
		stepOne: 'Masukkan nilai yang valid. Nilai valid terdekatnya adalah {value}.',
		badInput: 'Masukkan nomor.',
		decimal: ',',
	},
	it: {
		underflow: 'Il valore deve essere superiore o uguale a {min}.',
		overflow: 'Il valore deve essere inferiore o uguale a {max}.',
		step: 'Inserisci un valore valido. I due valori validi più vicini sono {low} e {high}.',
		stepOne: 'Inserisci un valore valido. Il valore valido più vicino è {value}.',
		badInput: 'Inserisci un numero.',
		decimal: ',',
	},
	ja: {
		underflow: '値は {min} 以上にする必要があります。',
		overflow: '値は {max} 以下にする必要があります。',
		step: '有効な値を入力してください。有効な値として最も近いのは {low} と {high} です。',
		stepOne: '有効な値を入力してください。有効な値として最も近いのは {value} です。',
		badInput: '数字を入力してください。',
	},
	kn: {
		underflow: 'ಮೌಲ್ಯವು {min} ಕ್ಕಿಂತಲೂ ಹೆಚ್ಚಾಗಿರಬೇಕು ಅಥವಾ ಸಮನಾಗಿರಬೇಕು.',
		overflow: 'ಮೌಲ್ಯವು {max} ಕ್ಕೆ ಸಮನಾಗಿರಬಹುದು ಅಥವಾ ಅದಕ್ಕಿಂತಲೂ ಕಡಿಮೆ ಆಗಿರಬಹುದು.',
		step: 'ಮಾನ್ಯವಾದ ಮೌಲ್ಯವನ್ನು ನಮೂದಿಸಿ. {low} ಮತ್ತು {high} ಎರಡು ಹತ್ತಿರದ ಮಾನ್ಯ ಮೌಲ್ಯಗಳಾಗಿವೆ.',
		stepOne: 'ಮಾನ್ಯ ಮೌಲ್ಯವನ್ನು ನಮೂದಿಸಿ. ಹತ್ತಿರದ ಮಾನ್ಯ ಮೌಲ್ಯವು {value} ಆಗಿದೆ.',
		badInput: 'ದಯವಿಟ್ಟು ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.',
	},
	ko: {
		underflow: '값은 {min} 이상이어야 합니다.',
		overflow: '값은 {max} 이하여야 합니다.',
		step: '유효한 값을 입력해 주세요. 가장 근접한 유효 값 2개는 {low} 및 {high}입니다.',
		stepOne: '유효한 값을 입력해 주세요. 가장 근접한 유효 값은 {value}입니다.',
		badInput: '숫자를 입력하세요.',
	},
	lt: {
		underflow: 'Vertė turi būti {min} arba didesnė.',
		overflow: 'Vertė turi būti {max} arba mažesnė.',
		step: 'Įveskite galiojančią vertę. Dvi artimiausios vertės yra {low} ir {high}.',
		stepOne: 'Įveskite tinkamą vertę. Artimiausia tinkama vertė yra {value}.',
		badInput: 'Įveskite skaičių.',
		decimal: ',',
	},
	lv: {
		underflow: 'Vērtībai ir jābūt lielākai vai vienādai ar {min}.',
		overflow: 'Vērtībai ir jābūt mazākai vai vienādai ar {max}.',
		step: 'Lūdzu, ievadiet derīgu vērtību. Divas tuvākās derīgās vērtības ir {low} un {high}.',
		stepOne: 'Lūdzu, ievadiet derīgu vērtību. Tuvākā derīgā vērtība ir {value}.',
		badInput: 'Lūdzu, ievadiet skaitli.',
		decimal: ',',
	},
	ml: {
		underflow: 'മൂല്യം {min} എന്നതില്‍ കൂടുതലോ സമമോ ആയിരിക്കണം.',
		overflow: 'മൂല്യം {max} എന്നതില്‍ കുറവോ സമമോ ആയിരിക്കണം.',
		step: 'സാധുവായ മൂല്യം നൽകുക. സാധുവായ ഏറ്റവുമടുത്ത രണ്ട് മൂല്യങ്ങൾ {low}, {high} എന്നിവയാണ്.',
		stepOne: 'സാധുവായ ഒരു മൂല്യം നൽകുക. ഏറ്റവുമടുത്ത സാധുവായ മൂല്യം {value} ആണ്.',
		badInput: 'ഒരു നമ്പർ നൽകുക.',
	},
	mr: {
		underflow: 'मूल्य {min} पेक्षा मोठे किंवा समान असावे.',
		overflow: 'मूल्य {max} पेक्षा कमी किंवा समान असावे.',
		step: 'कृपया एक वैध मूल्य एंटर करा. दोन जवळील वैध मूल्ये {low} आणि {high} आहेत.',
		stepOne: 'कृपया एक वैध मूल्य एंटर करा. जवळील वैध मूल्य {value} आहे.',
		badInput: 'कृपया एक नंबर एंटर करा.',
	},
	ms: {
		underflow: 'Nilai mesti lebih besar daripada atau sama dengan {min}.',
		overflow: 'Nilai mestilah kurang daripada atau sama dengan {max}.',
		step: 'Sila masukkan nilai yang sah. Dua nilai sah yang terdekat ialah {low} dan {high}.',
		stepOne: 'Sila masukkan nilai yang sah. Nilai sah yang terdekat ialah {value}.',
		badInput: 'Sila masukkan nombor.',
	},
	nb: {
		underflow: 'Verdien må være større enn eller lik {min}.',
		overflow: 'Verdien må være mindre enn eller lik {max}.',
		step: 'Skriv inn en gyldig verdi. De to nærmeste, gyldige verdiene er {low} og {high}.',
		stepOne: 'Skriv inn en gyldig verdi. Den nærmeste, gyldige verdien er {value}.',
		badInput: 'Skriv inn et tall.',
		decimal: ',',
	},
	nl: {
		underflow: 'Waarde moet groter dan of gelijk zijn aan {min}.',
		overflow: 'Waarde moet kleiner dan of gelijk zijn aan {max}.',
		step: 'Geef een geldige waarde op. De twee dichtstbijzijnde geldige waarden zijn {low} en {high}.',
		stepOne: 'Geef een geldige waarde op. De dichtstbijzijnde geldige waarde is {value}.',
		badInput: 'Voer een getal in.',
		decimal: ',',
	},
	pl: {
		underflow: 'Wartość nie może być mniejsza niż {min}.',
		overflow: 'Wartość nie może być większa niż {max}.',
		step: 'Podaj prawidłową wartość. Dwie najbliższe prawidłowe wartości to {low} i {high}.',
		stepOne: 'Podaj prawidłową wartość. Najbliższa prawidłowa wartość to {value}.',
		badInput: 'Wpisz liczbę.',
		decimal: ',',
	},
	'pt-BR': {
		underflow: 'O valor deve ser maior ou igual a {min}.',
		overflow: 'O valor deve ser menor ou igual a {max}.',
		step: 'Insira um valor válido. Os dois valores válidos mais próximos são {low} e {high}.',
		stepOne: 'Insira um valor válido. O valor válido mais próximo é {value}.',
		badInput: 'Insira um número.',
		decimal: ',',
	},
	'pt-PT': {
		underflow: 'O valor tem de ser superior ou igual a {min}.',
		overflow: 'O valor tem de ser inferior ou igual a {max}.',
		step: 'Introduza um valor válido. Os dois valores válidos mais próximos são {low} e {high}.',
		stepOne: 'Introduza um valor válido. O valor válido mais próximo é {value}.',
		badInput: 'Introduza um número.',
		decimal: ',',
	},
	ro: {
		underflow: 'Valoarea trebuie să fie mai mare sau egală cu {min}.',
		overflow: 'Valoarea trebuie să fie mai mică sau egală cu {max}.',
		step: 'Introduceți o valoare validă. Cele mai apropiate valori valide sunt {low} și {high}.',
		stepOne: 'Introduceți o valoare validă. Cea mai apropiată valoare validă este {value}.',
		badInput: 'Introduceți un număr.',
		decimal: ',',
	},
	ru: {
		underflow: 'Значение должно быть больше или равно {min}.',
		overflow: 'Значение должно быть меньше или равно {max}.',
		step: 'Введите допустимое значение. Ближайшие допустимые значения: {low} и {high}.',
		stepOne: 'Введите допустимое значение. Ближайшее допустимое значение: {value}.',
		badInput: 'Введите число.',
		decimal: ',',
	},
	sk: {
		underflow: 'Hodnota musí byť väčšia alebo rovná hodnote {min}.',
		overflow: 'Hodnota musí byť menšia alebo rovná hodnote {max}.',
		step: 'Zadajte platnú hodnotu. Najbližšie platné hodnoty sú {low} a {high}.',
		stepOne: 'Zadajte platnú hodnotu. Najbližšia platná hodnota je {value}.',
		badInput: 'Zadajte číslo.',
		decimal: ',',
	},
	sl: {
		underflow: 'Vrednost mora biti večja od {min} ali enaka.',
		overflow: 'Vrednost mora biti manjša od {max} ali enaka.',
		step: 'Vnesite veljavno vrednost. Najbližji veljavni vrednosti sta {low} in {high}.',
		stepOne: 'Vnesite veljavno vrednost. Najbližja veljavna vrednost je {value}.',
		badInput: 'Vnesite številko.',
		decimal: ',',
	},
	sr: {
		underflow: 'Вредност сме да буде најмање {min}.',
		overflow: 'Вредност сме да буде највише {max}.',
		step: 'Унесите важећу вредност. Две најближе важеће вредности су {low} и {high}.',
		stepOne: 'Унесите важећу вредност. Најближа важећа вредност је {value}.',
		badInput: 'Унесите број.',
		decimal: ',',
	},
	sv: {
		underflow: 'Värdet måste vara större än eller lika med {min}.',
		overflow: 'Värdet måste vara mindre än eller lika med {max}.',
		step: 'Ange ett giltigt värde. De två närmaste giltiga värdena är {low} och {high}.',
		stepOne: 'Ange ett giltigt värde. Det närmast giltiga värdet är {value}.',
		badInput: 'Ange ett nummer.',
		decimal: ',',
	},
	sw: {
		underflow: 'Lazima thamani iwe kubwa kuliko au sawa na {min}.',
		overflow: 'Lazima thamani iwe chache kuliko au sawa na {max}.',
		step: 'Tafadhali ingiza thamani halali. Thamani mbili halali za karibu ni {low} na {high}.',
		stepOne: 'Tafadhali ingiza thamani halali.Thamani halali ya karibu ni {value}.',
		badInput: 'Tafadhali ingiza namba.',
	},
	ta: {
		underflow: 'மதிப்பானது, கண்டிப்பாக {min} ஐ விட அதிகமாக அல்லது அதற்குச் சமமாக இருக்க வேண்டும்.',
		overflow: 'மதிப்பானது கண்டிப்பாக {max} ஐ விடக்குறைவாக அல்லது அதற்குச் சமமாக இருக்க வேண்டும்.',
		step: 'சரியான மதிப்பை உள்ளிடவும். {low} மற்றும் {high} ஆகியவை மிக நெருக்கமான சரியான இரண்டு மதிப்புகளாகும்.',
		stepOne: 'சரியான மதிப்பை உள்ளிடவும்.  {value} என்பது நெருக்கமாக உள்ள சரியான மதிப்பாகும்.',
		badInput: 'எண்ணை உள்ளிடுக.',
	},
	te: {
		underflow: 'విలువ ఖచ్చితంగా {min} కంటే ఎక్కువగా లేదా సమానంగా ఉండాలి.',
		overflow: 'విలువ ఖచ్చితంగా {max} కంటే తగ్గువగా లేదా సమానంగా ఉండాలి.',
		step: 'దయచేసి చెల్లుబాటు అయ్యే విలువను నమోదు చేయండి. {low} మరియు {high} అనేవి రెండు సమీప చెల్లుబాటు విలువలు.',
		stepOne: 'దయచేసి చెల్లుబాటు అయ్యే విలువను నమోదు చేయండి. {value} అనేది సమీప చెల్లుబాటు విలువ.',
		badInput: 'దయచేసి సంఖ్యను నమోదు చేయండి.',
	},
	th: {
		underflow: 'ค่าต้องมากกว่าหรือเท่ากับ {min}',
		overflow: 'ค่าต้องน้อยกว่าหรือเท่ากับ {max}',
		step: 'โปรดป้อนค่าที่ถูกต้อง ค่าใกล้เคียงที่สุดที่ถูกต้องสองรายการคือ {low} และ {high}',
		stepOne: 'โปรดป้อนค่าที่ถูกต้อง ค่าใกล้เคียงที่สุดที่ถูกต้องคือ {value}',
		badInput: 'โปรดป้อนตัวเลข',
	},
	tr: {
		underflow: 'Değer {min} veya daha büyük olmalıdır.',
		overflow: 'Değer {max} veya daha küçük olmalıdır.',
		step: 'Lütfen geçerli bir değer girin. En yakın iki geçerli değer şunlardır: {low} ve {high}.',
		stepOne: 'Lütfen geçerli bir değer girin. En yakın geçerli değer şudur: {value}',
		badInput: 'Lütfen bir sayı girin.',
		decimal: ',',
	},
	uk: {
		underflow: 'Значення має бути більшим або дорівнювати {min}.',
		overflow: 'Значення має бути меншим або дорівнювати {max}.',
		step: 'Введіть дійсне значення. Два найближчі дійсні значення: {low} і {high}.',
		stepOne: 'Введіть дійсне значення. Найближче дійсне значення: {value}.',
		badInput: 'Введіть число.',
		decimal: ',',
	},
	ur: {
		underflow: 'قدر {min} سے زیادہ یا اس کے برابر ہونا ضروری ہے۔',
		overflow: 'قدر {max} سے کم یا اس کے برابر ہونی چاہیے۔',
		step: 'براہ کرم ایک درست قدر درج کریں۔ دو قریب ترین درست اقدار {low} اور {high} ہیں۔',
		stepOne: 'براہ کرم ایک درست قدر درج کریں۔ قریب ترین درست قدر {value} ہے۔',
		badInput: 'براہ کرم ایک نمبر درج کریں۔',
	},
	vi: {
		underflow: 'Giá trị phải lớn hơn hoặc bằng {min}.',
		overflow: 'Giá trị phải nhỏ hơn hoặc bằng {max}.',
		step: 'Vui lòng nhập giá trị hợp lệ. Hai giá trị hợp lệ gần nhất là {low} và {high}.',
		stepOne: 'Vui lòng nhập giá trị hợp lệ. Giá trị hợp lệ gần nhất là {value}.',
		badInput: 'Vui lòng nhập một số.',
		decimal: ',',
	},
	'zh-CN': {
		underflow: '值必须大于或等于 {min}。',
		overflow: '值必须小于或等于 {max}。',
		step: '请输入有效值。两个最接近的有效值分别为{low}和{high}。',
		stepOne: '请输入有效值。最接近的有效值为{value}。',
		badInput: '请输入一个数字。',
	},
	'zh-TW': {
		underflow: '值必須大於或等於 {min}。',
		overflow: '值必須小於或等於 {max}。',
		step: '請輸入有效值。最接近的兩個有效值分別是 {low} 和 {high}。',
		stepOne: '請輸入有效值。最接近的有效值是 {value}。',
		badInput: '請輸入一個數字。',
	},
};
