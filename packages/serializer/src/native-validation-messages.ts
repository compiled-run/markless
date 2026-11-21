// Written by packages/mobile/test/write-validation-messages.ts from Chromium 156.0.8078.4; do not edit.

import type { NativeEmailMismatch, NativeTooLong } from './native-view.ts';

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

/** Chromium's `validationMessage` for an email field whose value is not an email address, one template for each way it is not. */
export const NATIVE_EMAIL_MISMATCH_BY_LOCALE: Readonly<Record<string, NativeEmailMismatch>> = {
	af: {
		missingAt: "Sluit asseblief 'n '@' by die e-posadres in. 'n '@' ontbreek in '{value}'.",
		noLocal: 'Voer asseblief \'n deel gevolg deur "@" in. "{value}" is onvolledig.',
		noDomain: 'Voer asseblief \'n deel in wat volg op "@". "{value}" is onvolledig.',
		localSymbol: '\'n Deel gevolg deur "@" moenie die simbool "{symbol}" bevat nie.',
		domainSymbol: "'n Deel wat '@' volg, behoort nie die simbool '{symbol}' te bevat nie.",
		dot: '"." word op die verkeerde plek gebruik in "{domain}".',
		other: "Voer asseblief 'n e-posadres in.",
	},
	am: {
		missingAt: 'እባክዎ በኢሜይል አድራሻው ውስጥ «@» ያካትቱ። «{value}» ውስጥ «@» ይጎድላል።',
		noLocal: 'እባክዎ አንድ ክፍል ያስገቡና «@»ን ያስከትሉ። «{value}» ያልተሟላ ነው።',
		noDomain: 'እባክዎ ከ«@» በኋላ አንድ ክፍል ያስገቡ። «{value}» ያልተሟላ ነው።',
		localSymbol: 'ከ«@» በፊት የሚመጣ ክፍል የ«{symbol}» ምልክት መያዝ የለበትም።',
		domainSymbol: 'ከ«@» በኋላ የሚመጣ ክፍል የ«{symbol}» ምልክት መያዝ የለበትም።',
		dot: '«.» በ«{domain}» ውስጥ በተሳሳተ ቦታ ላይ ነው የገባው።',
		other: 'እባክዎ የኢሜይል አድራሻ ያስገቡ።',
	},
	ar: {
		missingAt:
			'يُرجى تضمين العلامة "@" في عنوان البريد الإلكتروني، حيث يفتقر "{value}" إلى العلامة "@".',
		noLocal: 'يُرجى إدخال جزء متبوع بعلامة "@"، حيث إن "{value}" غير مكتمل.',
		noDomain: 'يُرجى إدخال الجزء الذي يلي العلامة "@"، حيث إن "{value}" غير مكتمل.',
		localSymbol: 'الجزء المتبوع بالعلامة "@" يجب ألا يشتمل على الرمز "{symbol}".',
		domainSymbol: 'يجب ألا يشتمل الجزء الذي يلي العلامة "@" على الرمز "{symbol}".',
		dot: 'تم استخدام "." في موضع خاطئ في "{domain}".',
		other: 'يُرجى إدخال عنوان البريد الإلكتروني.',
	},
	bg: {
		missingAt: 'Моля, включете „@“ в имейл адреса. В/ъв „{value}“ липсва „@“.',
		noLocal: 'Моля, въведете текст преди „@“. „{value}“ е непълно.',
		noDomain: 'Моля, въведете текст след „@“. „{value}“ е непълно.',
		localSymbol: 'Текстът преди „@“ не бива да съдържа символа „{symbol}“.',
		domainSymbol: 'Текстът след „@“ не бива да съдържа символа „{symbol}“.',
		dot: '„.“ се използва на неправилна позиция в/ъв „{domain}“.',
		other: 'Моля, въведете имейл адрес.',
	},
	bn: {
		missingAt: "ইমেল আইডিতে অনুগ্রহ করে একটি '@' অন্তর্ভুক্ত করুন৷ '{value}'-তে একটি '@' অনুপস্থিত৷",
		noLocal: "'@' অনুসরণ করে একটি অংশ লিখুন৷ '{value}' অসম্পূর্ণ৷",
		noDomain: "দয়া করে '@' অনুসরণ করে একটি অংশ লিখুন৷ '{value}' অসম্পূর্ণ৷",
		localSymbol: "'@' অনুসরণ করে এমন একটি অংশে '{symbol}' চিহ্ন থাকা উচিত নয়৷",
		domainSymbol: "'@' অনুসরণ করে এমন একটি অংশে '{symbol}' চিহ্ন থাকা উচিত নয়৷",
		dot: "'{domain}' এ একটি ভুল অবস্থানে '.' ব্যবহৃত হয়েছে৷",
		other: 'অনুগ্রহ করে কোন ইমেল আইডি লিখুন:',
	},
	ca: {
		missingAt:
			'Incloeu el símbol "@" a l\'adreça electrònica. Al camp "{value}" falta el símbol "@".',
		noLocal: 'Introduïu un nom d\'usuari seguit de "@". "{value}" no és una adreça completa.',
		noDomain:
			'Introduïu un domini precedit per "@". "{value}" no és una adreça electrònica completa.',
		localSymbol: 'Un nom d\'usuari seguit de "@" no pot contenir el símbol "{symbol}".',
		domainSymbol: 'Un domini precedit per "@" no pot contenir el símbol "{symbol}".',
		dot: '"." s\'ha utilitzat en una posició incorrecta a "{domain}".',
		other: 'Introduïu una adreça electrònica.',
	},
	cs: {
		missingAt: 'Do e-mailové adresy zahrňte znak @. V adrese {value} chybí znak @.',
		noLocal: 'Zadejte část před znakem @. Adresa {value} není úplná.',
		noDomain: 'Zadejte část za znakem @. Adresa {value} není úplná.',
		localSymbol: 'Část před znakem @ nesmí obsahovat znak {symbol}.',
		domainSymbol: 'Část za znakem @ nesmí obsahovat znak {symbol}.',
		dot: 'Znak . v doméně {domain} není použitý správně.',
		other: 'Zadejte prosím e-mailovou adresu.',
	},
	da: {
		missingAt: 'Mailadressen skal indeholde et "@". "{value}" mangler et "@".',
		noLocal: 'Angiv den del, der kommer før "@". "{value}" er ufuldstændig.',
		noDomain: 'Angiv den del, der kommer efter "@". "{value}" er ufuldstændig.',
		localSymbol: 'Den del, der kommer før "@", må ikke indeholde "{symbol}".',
		domainSymbol: 'Den del, der kommer efter "@", må ikke indeholde symbolet "{symbol}".',
		dot: '"." er placeret forkert i "{domain}".',
		other: 'Angiv en mailadresse.',
	},
	de: {
		missingAt:
			'Die E-Mail-Adresse muss ein @-Zeichen enthalten. In der Angabe "{value}" fehlt ein @-Zeichen.',
		noLocal: 'Gib etwas vor dem @-Zeichen ein. Die Angabe „{value}“ ist unvollständig.',
		noDomain: 'Gib etwas nach dem @-Zeichen ein. Die Angabe „{value}“ ist unvollständig.',
		localSymbol: 'Vor dem @-Zeichen darf das Zeichen "{symbol}" nicht verwendet werden.',
		domainSymbol: 'Nach dem @-Zeichen darf das Zeichen "{symbol}" nicht verwendet werden.',
		dot: 'Das Punktzeichen "." steht in "{domain}" an einer falschen Stelle.',
		other: 'Gib eine E-Mail-Adresse ein.',
	},
	el: {
		missingAt:
			'Συμπεριλάβετε το σύμβολο "@" στη διεύθυνση ηλεκτρονικού ταχυδρομείου. Από τη διεύθυνση "{value}" λείπει το σύμβολο "@".',
		noLocal:
			'Καταχωρίστε το τμήμα της διεύθυνσης πριν το σύμβολο "@". Η διεύθυνση "{value}" δεν είναι πλήρης.',
		noDomain:
			'Καταχωρίστε το τμήμα της διεύθυνσης μετά το σύμβολο "@". Η διεύθυνση "{value}" δεν είναι πλήρης.',
		localSymbol:
			'Το τμήμα της διεύθυνσης πριν το σύμβολο "@" δεν πρέπει να περιέχει το σύμβολο "{symbol}".',
		domainSymbol:
			'Το τμήμα της διεύθυνσης μετά το σύμβολο "@" δεν πρέπει να περιέχει το σύμβολο "{symbol}".',
		dot: 'Το σύμβολο "." χρησιμοποιείται σε λάθος θέση στη διεύθυνση "{domain}".',
		other: 'Εισαγάγετε μια διεύθυνση ηλεκτρονικού ταχυδρομείου.',
	},
	en: {
		missingAt: "Please include an '@' in the email address. '{value}' is missing an '@'.",
		noLocal: "Please enter a part followed by '@'. '{value}' is incomplete.",
		noDomain: "Please enter a part following '@'. '{value}' is incomplete.",
		localSymbol: "A part followed by '@' should not contain the symbol '{symbol}'.",
		domainSymbol: "A part following '@' should not contain the symbol '{symbol}'.",
		dot: "'.' is used at a wrong position in '{domain}'.",
		other: 'Please enter an email address.',
	},
	'en-GB': {
		missingAt: "Please include an '@' in the email address. '{value}' is missing an '@'.",
		noLocal: "Please enter a part followed by '@'. '{value}' is incomplete.",
		noDomain: "Please enter a part following '@'. '{value}' is incomplete.",
		localSymbol: "A part followed by '@' should not contain the symbol '{symbol}'.",
		domainSymbol: "A part following '@' should not contain the symbol '{symbol}'.",
		dot: "'.' is used at a wrong position in '{domain}'.",
		other: 'Please enter an email address.',
	},
	es: {
		missingAt:
			'Incluye un signo "@" en la dirección de correo electrónico. La dirección "{value}" no incluye el signo "@".',
		noLocal: 'Introduce texto seguido del signo "@". La dirección "{value}" está incompleta.',
		noDomain: 'Introduce texto detrás del signo "@". La dirección "{value}" está incompleta.',
		localSymbol: 'El texto seguido del signo "@" no debe incluir el símbolo "{symbol}".',
		domainSymbol: 'El texto detrás del signo "@" no debe incluir el símbolo "{symbol}".',
		dot: 'El signo "." está colocado en una posición incorrecta en la dirección "{domain}".',
		other: 'Introduce una dirección de correo electrónico',
	},
	'es-419': {
		missingAt:
			'Incluye un signo "@" en la dirección de correo electrónico. La dirección "{value}" no incluye el signo "@".',
		noLocal: 'Ingresa texto antes del signo "@". La dirección "{value}" está incompleta.',
		noDomain: 'Ingresa texto después del signo "@". La dirección "{value}" está incompleta.',
		localSymbol: 'El texto antes del signo "@" no debe incluir el símbolo "{symbol}".',
		domainSymbol: 'El texto después del signo "@" no debe incluir el símbolo "{symbol}".',
		dot: 'El signo "." está colocado en una posición incorrecta en "{domain}".',
		other: 'Ingresa una dirección de correo electrónico.',
	},
	et: {
		missingAt: 'Lisage e-posti aadressile märk „@”. Aadressist „{value}” puudub märk „@”.',
		noLocal: 'Sisestage märgile „@” eelnev osa. Aadress „{value}” pole täielik.',
		noDomain: 'Sisestage märgile „@” järgnev osa. Aadress „{value}” pole täielik.',
		localSymbol: 'Märgile „@” eelnev osa ei tohi sisaldada sümbolit „{symbol}”.',
		domainSymbol: 'Märgile „@” järgnev osa ei tohi sisaldada sümbolit „{symbol}”.',
		dot: 'Tähist „.” on aadressis „{domain}” valesti kasutatud.',
		other: 'Sisestage meiliaadress.',
	},
	fa: {
		missingAt: 'لطفاً نماد «@» را به نشانی ایمیل اضافه کنید. «{value}» در «@» موجود نیست.',
		noLocal: 'لطفاً قسمت قبل از «@» را وارد کنید. «{value}» ناقص است.',
		noDomain: 'لطفاً قسمت بعد از «@» را وارد کنید. «{value}» ناقص است.',
		localSymbol: 'قسمت قبل از «@» نباید حاوی نماد «{symbol}» باشد.',
		domainSymbol: 'قسمت بعد از «@» نباید حاوی نماد «{symbol}» باشد.',
		dot: '«.» در «{domain}» در محل اشتباهی قرار دارد.',
		other: 'لطفاً یک نشانی ایمیل وارد کنید.',
	},
	fi: {
		missingAt: 'Sähköpostiosoitteeseen kuuluu @-osa. Osoitteesta {value} puuttuu @.',
		noLocal: 'Lisää @-osaa ennen tuleva osa. {value} on puutteellinen.',
		noDomain: 'Kirjoita loppuun asti osoite, joka alkaa @. {value} on vielä kesken.',
		localSymbol: '@-osaa ennen tulevassa osassa ei pitäisi olla merkkiä {symbol}.',
		domainSymbol: '@-osan jälkeen tulevassa osassa ei pitäisi olla merkkiä {symbol}.',
		dot: '.-merkkiä on käytetty väärässä kohdassa osoitteessa {domain}.',
		other: 'Anna sähköpostiosoite.',
	},
	fil: {
		missingAt: "Mangyaring magsama ng '@' sa email address. Kulang ng '@' ang '{value}.'",
		noLocal:
			"Mangyaring maglagay ng isang bahagi na sinusundan ng '@.' Hindi kumpleto ang '{value}.'",
		noDomain:
			"Mangyaring maglagay ng isang bahagi pagkatapos ng '@.' Hindi kumpleto ang '{value}.'",
		localSymbol: "Hindi dapat naglalaman ng simbolong '{symbol}' ang bahagi bago ang '@.'",
		domainSymbol:
			"Hindi dapat naglalaman ng simbolong '{symbol}' ang bahagi pagkatapos ng '@.'",
		dot: "Ginamit ang '.' sa maling posisyon sa '{domain}.'",
		other: 'Mangyaring magpasok ng email address.',
	},
	fr: {
		missingAt:
			'Veuillez inclure "@" dans l\'adresse e-mail. Il manque un symbole "@" dans "{value}".',
		noLocal:
			'Veuillez saisir la partie manquante avant le caractère "@". L\'adresse "{value}" est incomplète.',
		noDomain:
			'Veuillez saisir la partie manquante après le symbole "@". L\'adresse "{value}" est incomplète.',
		localSymbol:
			'La partie suivie du symbole "@" ne doit pas contenir le caractère "{symbol}".',
		domainSymbol:
			'La partie précédée du symbole "@" ne doit pas contenir le caractère "{symbol}".',
		dot: 'L\'emplacement du caractère "." est incorrect dans "{domain}".',
		other: 'Veuillez saisir une adresse e-mail.',
	},
	gu: {
		missingAt: "કૃપા કરીને ઇમેઇલ સરનામાંમાં '@' શામેલ કરો. '{value}'માં '@' ખૂટે છે.",
		noLocal: "કૃપા કરીને '@' ની આગળનો ભાગ દાખલ કરો. '{value}' અપૂર્ણ છે.",
		noDomain: "કૃપા કરીને '@' ને અનુસરી રહેલો ભાગ દાખલ કરો. '{value}' અપૂર્ણ છે.",
		localSymbol: "'@' દ્વારા અનુસરાઈ રહેલા ભાગમાં '{symbol}' પ્રતીક શામેલ હોવું જોઈએ નહીં.",
		domainSymbol: "'@' ને અનુસરી રહેલા ભાગમાં '{symbol}' પ્રતીક શામેલ હોવું જોઈએ નહીં.",
		dot: "'.' નો ઉપયોગ '{domain}' માં ખોટી જગ્યાએ થયો છે.",
		other: 'કૃપા કરી કોઈ ઇમેઇલ ઍડ્રેસ દાખલ કરો.',
	},
	he: {
		missingAt: "אני רוצה לכלול '@' בכתובת האימייל. ב-'{value}' חסר '@'.",
		noLocal: "יש להזין חלק ואחריו '@'‏. השדה '{value}' אינו מלא.",
		noDomain: "יש להזין חלק ואחריו '@'. השדה '{value}' אינו מלא.",
		localSymbol: "חלק ולאחריו '@' לא אמור לכלול את הסמל '{symbol}'.",
		domainSymbol: "חלק ולאחריו '@' לא אמור לכלול את הסמל '{symbol}'.",
		dot: "נעשה שימוש ב-'.' במיקום שגוי ב-'{domain}'.",
		other: 'הזנת כתובת אימייל.',
	},
	hi: {
		missingAt: "कृपया ईमेल पते में '@' शामिल करें. '{value}' में '@' नहीं है.",
		noLocal: "कृपया '@' के पहले वाला भाग डालें. '{value}' अधूरा है.",
		noDomain: "कृपया '@' के बाद आने वाला भाग डालें. '{value}' अधूरा है.",
		localSymbol: "'@' के बाद आने वाले भाग में '{symbol}' प्रतीक शामिल नहीं होना चाहिए.",
		domainSymbol: "'@' के बाद आने वाले भाग में '{symbol}' प्रतीक शामिल नहीं होना चाहिए.",
		dot: "'.' का '{domain}' में गलत स्थान पर उपयोग किया गया है.",
		other: 'कृपया ई-मेल पता दर्ज करें.',
	},
	hr: {
		missingAt: 'Uključite znak "@" u e-adresu. U adresi "{value}" nedostaje znak "@".',
		noLocal: 'Unesite dio adrese ispred znaka "@". "{value}" nije potpuna e-adresa.',
		noDomain: 'Unesite dio adrese iza znaka "@". "{value}" nije potpuna e-adresa.',
		localSymbol: 'Dio adrese ispred znaka "@" ne smije sadržavati simbol "{symbol}".',
		domainSymbol: 'Dio adrese iza znaka "@" ne smije sadržavati simbol "{symbol}".',
		dot: 'Znak "." upotrebljava se na pogrešnom položaju u domeni "{domain}".',
		other: 'Unesite e-adresu.',
	},
	hu: {
		missingAt:
			'Kérjük, írjon egy „@” karaktert az e-mail címbe. A(z) „{value}” címből hiányzik a „@” jel.',
		noLocal: 'Kérjük, adja meg a „@” előtti részt is. A „{value}” cím nem teljes.',
		noDomain: 'Kérjük, adja meg a „@” utáni részt is. A(z) „{value}” cím nem teljes.',
		localSymbol: 'A „@” előtti rész nem tartalmazhat „{symbol}” karaktert.',
		domainSymbol: 'A „@” utáni rész nem tartalmazhat „{symbol}” karaktert.',
		dot: 'A „.” rossz helyen van a(z) „{domain}” címben.',
		other: 'Kérjük, adjon meg egy e-mail címet.',
	},
	id: {
		missingAt: "Sertakan '@' pada alamat email. '{value}' tidak memiliki '@'.",
		noLocal: "Masukkan bagian yang diikuti dengan '@'. '{value}' tidak lengkap.",
		noDomain: "Masukkan bagian setelah '@'. '{value}' tidak lengkap.",
		localSymbol: "Bagian sebelum '@' tidak boleh berisi simbol '{symbol}'.",
		domainSymbol: "Bagian setelah '@' tidak boleh berisi simbol '{symbol}'.",
		dot: "'.' digunakan pada posisi yang salah di '{domain}'.",
		other: 'Masukkan alamat email.',
	},
	it: {
		missingAt:
			'Aggiungi un simbolo "@" nell\'indirizzo email. In "{value}" manca un simbolo "@".',
		noLocal: 'Inserisci una parte seguita da "@". Il valore "{value}" è incompleto.',
		noDomain: 'Inserisci una parte dopo "@". Il valore "{value}" è incompleto.',
		localSymbol: 'Una parte seguita da "@" non deve contenere il simbolo "{symbol}".',
		domainSymbol: 'Una parte che segue "@" non deve contenere il simbolo "{symbol}".',
		dot: 'Il segno "." è utilizzato in una posizione errata in "{domain}".',
		other: 'Inserisci un indirizzo email.',
	},
	ja: {
		missingAt: 'メール アドレスに「@」を挿入してください。「{value}」内に「@」がありません。',
		noLocal:
			'「@」の前の文字列を入力してください。「{value}」は完全なメール アドレスではありません。',
		noDomain:
			'「{value}」は完全なメールアドレスではありません。「@」に続く文字列を入力してください。',
		localSymbol: '「@」の前の文字列に記号「{symbol}」を使用しないでください。',
		domainSymbol: '「@」に続く文字列に記号「{symbol}」を使用しないでください。',
		dot: '「{domain}」内の「.」の位置が間違っています。',
		other: 'メール アドレスを入力してください。',
	},
	kn: {
		missingAt: "ಇಮೇಲ್ ವಿಳಾಸದಲ್ಲಿ ಒಂದು '@' ಅನ್ನು ಸೇರಿಸಿ. '@' ನಲ್ಲಿ '{value}' ಕಾಣೆಯಾಗಿದೆ.",
		noLocal: "'@' ನಂತರದ ಭಾಗವನ್ನು ನಮೂದಿಸಿ. '{value}' ಅಪೂರ್ಣವಾಗಿದೆ.",
		noDomain: "'@' ನಂತರದ ಒಂದು ಭಾಗವನ್ನು ನಮೂದಿಸಿ. '{value}' ಅಪೂರ್ಣವಾಗಿದೆ.",
		localSymbol: "'@' ನಂತರದ ಭಾಗವು '{symbol}' ಚಿಹ್ನೆಯನ್ನು ಒಳಗೊಂಡಿರಬಾರದು.",
		domainSymbol: "'@' ನಂತರದ ಭಾಗವು '{symbol}' ಚಿಹ್ನೆಯನ್ನು ಒಳಗೊಂಡಿರಬಾರದು.",
		dot: "'.' ಅನ್ನು '{domain}' ನಲ್ಲಿ ತಪ್ಪಾದ ಸ್ಥಾನದಲ್ಲಿ ಬಳಸಲಾಗಿದೆ.",
		other: 'ದಯವಿಟ್ಟು ಇಮೇಲ್ ವಿಳಾಸವನ್ನು ನಮೂದಿಸಿ.',
	},
	ko: {
		missingAt: "이메일 주소에 '@'를 포함해 주세요. '{value}'에 '@'가 없습니다.",
		noLocal: "'@' 앞 부분을 입력해 주세요. '{value}'(이)가 완전하지 않습니다.",
		noDomain: "'@' 뒷 부분을 입력해 주세요. '{value}'(이)가 완전하지 않습니다.",
		localSymbol: "'@' 앞 부분에 '{symbol}' 기호가 포함되면 안됩니다.",
		domainSymbol: "'@' 다음 부분에 '{symbol}' 기호가 포함되면 안됩니다.",
		dot: "'{domain}'에서 '.'의 위치가 잘못되었습니다.",
		other: '이메일 주소를 입력하세요.',
	},
	lt: {
		missingAt: 'Į el. pašto adresą įtraukite „@“. „{value}“ trūksta „@“.',
		noLocal: 'Įveskite el. pašto adreso dalį iki „@“. „{value}“ nėra visas el. pašto adresas.',
		noDomain: 'Įveskite dalį po „@“. „{value}“ nėra visas el. pašto adresas.',
		localSymbol: 'Prieš „@“ esančioje dalyje neturėtų būti simbolio „{symbol}“.',
		domainSymbol: 'Po „@“ esančioje dalyje neturėtų būti simbolio „{symbol}“.',
		dot: '„.“ naudojamas netinkamoje „{domain}“ vietoje.',
		other: 'Įveskite el. pašto adresą.',
	},
	lv: {
		missingAt: 'E-pasta adresē ietveriet zīmi @. Adresē “{value}” trūkst zīmes @.',
		noLocal: 'Lūdzu, ievadiet daļu, kas atrodas pirms zīmes @. “{value}” ir nepilna adrese.',
		noDomain: 'Lūdzu, ievadiet daļu, kas atrodas aiz zīmes @. “{value}” ir nepilna adrese.',
		localSymbol: 'Daļā, kas atrodas pirms zīmes @, nedrīkst būt ietverts simbols {symbol}.',
		domainSymbol: 'Daļā, kas atrodas aiz zīmes @, nedrīkst būt ietverts simbols {symbol}.',
		dot: 'Punkts (.) atrodas nepareizā vietā ({domain}).',
		other: 'Ievadiet e-pasta adresi.',
	},
	ml: {
		missingAt: "ഇമെയിൽ വിലാസത്തിൽ '@' ഉൾപ്പെടുത്തുക. '{value}' എന്നതിൽ ഒരു '@' കാണുന്നില്ല.",
		noLocal: "'@' എന്നതിനുശേഷം ഒരു ഭാഗം നൽകുക.'{value}' അപൂർണ്ണമാണ്.",
		noDomain: "'@' എന്നതിനുശേഷം ഒരു ഭാഗം നൽകുക.'{value}' അപൂർണ്ണമാണ്.",
		localSymbol: "'@' എന്നതിനുശേഷം വരുന്ന ഒരു ഭാഗത്തിൽ '{symbol}' ചിഹ്നം ഉണ്ടാകരുത്.",
		domainSymbol: "'@' എന്നതിനുശേഷം വരുന്ന ഭാഗത്തിൽ '{symbol}' ചിഹ്നം ഉണ്ടാകരുത്.",
		dot: "'.', '{domain}' എന്നതിൽ തെറ്റായ സ്ഥാനത്താണ് ഉപയോഗിച്ചിരിക്കുന്നത്.",
		other: 'ദയവായി ഒരു ഇമെയില്‍ വിലാസം നല്‍കുക.',
	},
	mr: {
		missingAt: "कृपया ईमेल पत्त्यामध्ये '@' समाविष्ट करा. '{value}' '@' गमावत आहे.",
		noLocal: "कृपया '@' मागुन येणारा भाग एंटर करा. '{value}' अपूर्ण आहे.",
		noDomain: "कृपया '@' चे फॉलो करणारा भाग एंटर करा. '{value}' अपूर्ण आहे.",
		localSymbol: "'@' मागुन येणार्‍या भागामध्ये '{symbol}' चिन्ह नसावे.",
		domainSymbol: "'@' चे फॉलो करणार्‍या भागामध्ये '{symbol}' चिन्ह नसावे.",
		dot: "'.' '{domain}' मध्ये चुकीच्या स्थितीवर वापरले आहे.",
		other: 'कृपया एक ईमेल ॲड्रेस एंटर करा.',
	},
	ms: {
		missingAt: "Sila masukkan '@' dalam alamat e-mel. '{value}' tiada '@'.",
		noLocal: "Sila masukkan bahagian diikuti oleh '@'. '{value}' tidak lengkap.",
		noDomain: "Sila masukkan bahagian selepas '@'. '{value}' tidak lengkap.",
		localSymbol: "Bahagian yang diikuti oleh '@' tidak boleh mengandungi simbol '{symbol}'.",
		domainSymbol: "Bahagian selepas '@' tidak boleh mengandungi simbol '{symbol}'.",
		dot: "'.' digunakan pada kedudukan yang salah dalam '{domain}'.",
		other: 'Sila masukkan alamat e-mel.',
	},
	nb: {
		missingAt: 'Inkluder en «@» i e-postadressen. «{value}» mangler en «@».',
		noLocal: 'Skriv inn en del etterfulgt av «@». «{value}» er ufullstendig.',
		noDomain: 'Skriv inn en del etterfulgt av «@». «{value}» er ufullstendig.',
		localSymbol: 'En del etterfulgt av «@» kan ikke inneholde symbolet «{symbol}».',
		domainSymbol: 'En del etterfulgt av «@» kan ikke inneholde symbolet «{symbol}».',
		dot: '«.» er brukt på feil sted i «{domain}».',
		other: 'Skriv inn en e-postadresse.',
	},
	nl: {
		missingAt: "Gebruik een '@' in het e-mailadres. In '{value}' ontbreekt een '@'.",
		noLocal: "Geef een naamgedeelte op, gevolgd door '@'. '{value}' is onvolledig.",
		noDomain: "Geef een adresgedeelte op na '@'. '{value}' is onvolledig.",
		localSymbol: "Het naamgedeelte vóór '@' mag niet het teken '{symbol}' bevatten.",
		domainSymbol: "Het adresgedeelte na '@' mag niet het teken '{symbol}' bevatten.",
		dot: "'.' wordt op een verkeerde positie gebruikt in '{domain}'.",
		other: 'Geef een e-mailadres op.',
	},
	pl: {
		missingAt: 'Uwzględnij znak „@” w adresie e-mail. W adresie „{value}” brakuje znaku „@”.',
		noLocal: 'Podaj część przed znakiem „@”. Adres „{value}” jest niepełny.',
		noDomain: 'Podaj część po znaku „@”. Adres „{value}” jest niepełny.',
		localSymbol: 'Część przed znakiem „@” nie może zawierać symbolu „{symbol}”.',
		domainSymbol: 'Część po znaku „@” nie może zawierać symbolu „{symbol}”.',
		dot: '„.” występuje w niewłaściwym miejscu w „{domain}”.',
		other: 'Wprowadź adres e-mail.',
	},
	'pt-BR': {
		missingAt: 'Inclua um "@" no endereço de e-mail. "{value}" está com um "@" faltando.',
		noLocal: 'Insira uma parte seguida por "@". "{value}" está incompleto.',
		noDomain: 'Insira uma parte depois de "@". "{value}" está incompleto.',
		localSymbol: 'Uma parte seguida por "@" não deve conter o símbolo "{symbol}".',
		domainSymbol: 'A parte depois de "@" não deve conter o símbolo "{symbol}".',
		dot: '"." está sendo usado em uma posição incorreta em "{domain}".',
		other: 'Insira um endereço de e-mail.',
	},
	'pt-PT': {
		missingAt: 'Inclua um "@" no endereço de email. Falta um "@" em "{value}".',
		noLocal: 'Introduza uma parte seguida de "@". "{value}" está incompleto.',
		noDomain: 'Introduza uma parte a seguir a "@". "{value}" está incompleto.',
		localSymbol: 'Uma parte seguida de "@" não deve conter o símbolo "{symbol}".',
		domainSymbol: 'Uma parte a seguir a "@" não deve conter o símbolo "{symbol}".',
		dot: '"." está a ser utilizado numa posição errada em "{domain}".',
		other: 'Introduza um endereço de email.',
	},
	ro: {
		missingAt:
			'Includeți semnul „@” în adresa de e-mail. Din adresa „{value}” lipsește semnul „@”.',
		noLocal: 'Introduceți o valoare urmată de semnul „@”. Adresa „{value}” nu este completă.',
		noDomain: 'Introduceți o valoare după semnul „@”. Adresa „{value}” nu este completă.',
		localSymbol: 'Valoarea urmată de semnul „@” nu trebuie să conțină simbolul „{symbol}”.',
		domainSymbol:
			'Valoarea care urmează după semnul „@” nu trebuie să conțină simbolul „{symbol}”.',
		dot: 'Semnul „.” apare poziționat greșit în „{domain}”.',
		other: 'Introdu o adresă de e-mail.',
	},
	ru: {
		missingAt:
			'Адрес электронной почты должен содержать символ "@". В адресе "{value}" отсутствует символ "@".',
		noLocal: 'Введите часть адреса до символа "@". Адрес "{value}" неполный.',
		noDomain: 'Введите часть адреса после символа "@". Адрес "{value}" неполный.',
		localSymbol: 'Часть адреса до символа "@" не должна содержать символ "{symbol}".',
		domainSymbol: 'Часть адреса после символа "@" не должна содержать символ "{symbol}".',
		dot: 'Недопустимое положение символа "." в адресе "{domain}".',
		other: 'Введите адрес электронной почты.',
	},
	sk: {
		missingAt: 'Uveďte v e-mailovej adrese znak @. V adrese {value} znak @ chýba.',
		noLocal: 'Zadajte časť pred znakom @. Adresa {value} je neúplná.',
		noDomain: 'Zadajte časť za znakom @. Adresa {value} je neúplná.',
		localSymbol: 'Časť pred znakom @ by nemala obsahovať symbol {symbol}.',
		domainSymbol: 'Časť za znakom @ by nemala obsahovať symbol {symbol}.',
		dot: 'Znak . je v doméne {domain} použitý na nesprávnej pozícii.',
		other: 'Zadajte e-mailovú adresu.',
	},
	sl: {
		missingAt: 'V e-poštnem naslovu mora biti znak »@«. V naslovu »{value}« manjka »@«.',
		noLocal: 'Vnesite nekaj in nato @. Naslov »{value}« je nepopoln.',
		noDomain: 'Vnesite nekaj po znaku »@«. Naslov »{value}« je nepopoln.',
		localSymbol: 'Del pred »@« ne sme vsebovati znaka »{symbol}«.',
		domainSymbol: 'Del po »@« ne sme vsebovati znaka »{symbol}«.',
		dot: '».« je na napačnem mestu v »{domain}«.',
		other: 'Vnesite e-poštni naslov',
	},
	sr: {
		missingAt: 'Уврстите „@“ у имејл адресу. У адреси е-поште „{value}“ недостаје „@“.',
		noLocal: 'Унесите неки део пре „@“. Адреса „{value}“ је непотпуна.',
		noDomain: 'Унесите неки део после „@“. Адреса „{value}“ је непотпуна.',
		localSymbol: 'Део пре „@“ не треба да садржи симбол „{symbol}“.',
		domainSymbol: 'Део после „@“ не треба да садржи симбол „{symbol}“.',
		dot: '„.“ је стављено на погрешно место у „{domain}“.',
		other: 'Унесите имејл адресу.',
	},
	sv: {
		missingAt: 'Inkludera ett @ i e-postadressen. {value} saknar ett @.',
		noLocal: 'Ange en del följt av @. {value} är ofullständig.',
		noDomain: 'Ange en del följt av @. {value} är ofullständig.',
		localSymbol: 'En del följt av @ får inte innehålla symbolen {symbol}.',
		domainSymbol: 'En del efter @ får inte innehålla symbolen {symbol}.',
		dot: '. används på fel plats i {domain}.',
		other: 'Ange en e-postadress.',
	},
	sw: {
		missingAt: "Tafadhali jumuisha '@' katika anwani ya barua pepe. '{value}' inakosa '@'.",
		noLocal: "Tafadhali ingiza sehemu ikifuatiwa na '@'. '{value}' haijakamilika.",
		noDomain: "Tafadhali ingiza sehemu inayofuatia '@'. '{value}' haijakamilika.",
		localSymbol: "Sehemu inayofuatwa na '@' haipaswi kuwa na alama ya '{symbol}'.",
		domainSymbol: "Sehemu inayofuata '@' haipaswi kuwa na alama ya '{symbol}'.",
		dot: "' . 'imetumika kwenye nafasi isiyostahili katika '{domain}'.",
		other: 'Tafadhali weka anwani ya barua pepe.',
	},
	ta: {
		missingAt: "மின்னஞ்சல் முகவரியில் '@' ஐச் சேர்க்கவும். '@' இல் '{value}' இல்லை.",
		noLocal: "'@' ஐத் தொடர்ந்து ஒரு பகுதியை உள்ளிடவும். '{value}' முழுமைப் பெறாமல் உள்ளது.",
		noDomain: "'@' ஐத் தொடர்ந்து ஒரு பகுதியை உள்ளிடவும். '{value}' முழுமைப்பெறாமல் உள்ளது.",
		localSymbol: "'@' ஐத் தொடர்ந்து வரும் பகுதியில் '{symbol}' சின்னம் இருக்கக்கூடாது.",
		domainSymbol: "'@' ஐத் தொடரும் பகுதியில், '{symbol}' சின்னம் இருக்கக்கூடாது.",
		dot: "{domain} இல் தவறான இடத்தில் '.' பயன்படுத்தபட்டுள்ளது.",
		other: 'ஒரு மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
	},
	te: {
		missingAt: "దయచేసి ఈమెయిల్‌ అడ్రస్‌లో '@'ని చేర్చండి. '{value}'లో '@' లేదు.",
		noLocal: "దయచేసి '@'కి ముందు ఉన్న భాగాన్ని నమోదు చేయండి. '{value}' అసంపూర్ణంగా ఉంది.",
		noDomain: "దయచేసి '@'కి తర్వాత ఉన్న భాగాన్ని నమోదు చేయండి. '{value}' అసంపూర్ణంగా ఉంది.",
		localSymbol: "'@'కి ముందు ఉన్న భాగంలో '{symbol}' చిహ్నం ఉండకూడదు.",
		domainSymbol: "'@'కి తర్వాత ఉన్న భాగంలో '{symbol}' చిహ్నం ఉండకూడదు.",
		dot: "'{domain}'లో '.' తప్పు స్థానంలో ఉపయోగించబడింది.",
		other: 'దయచేసి ఈమెయిల్‌ అడ్రస్‌ను ఎంటర్ చేయండి.',
	},
	th: {
		missingAt: 'โปรดใส่ "@" ในที่อยู่อีเมล "{value}" ขาด "@"',
		noLocal: 'โปรดป้อนส่วนหนึ่งโดยตามด้วย "@" "{value}" นั้นไม่สมบูรณ์',
		noDomain: 'โปรดป้อนส่วนที่ต่อท้าย "@" "{value}" นั้นไม่สมบูรณ์',
		localSymbol: 'ส่วนที่ตามด้วย "@" ต้องไม่มีสัญลักษณ์ "{symbol}"',
		domainSymbol: 'ส่วนที่ต่อท้าย "@" ต้องไม่มีสัญลักษณ์ "{symbol}"',
		dot: '"." ถูกใช้งานในตำแหน่งที่ไม่ถูกต้องใน "{domain}"',
		other: 'โปรดป้อนที่อยู่อีเมล',
	},
	tr: {
		missingAt:
			'Lütfen e-posta adresine bir "@" işareti ekleyin. "{value}" adresinde "@" eksik.',
		noLocal: 'Lütfen başına "@" ekleyin. "{value}" adresi eksik.',
		noDomain:
			'Lütfen "@" işaretinden sonra gelen kısmı ekleyin. "{value}", tam bir adres değil.',
		localSymbol: 'Başında "@" bulunan kısımda "{symbol}" simgesi bulunmamalıdır.',
		domainSymbol: 'Başında "@" bulunan kısımda "{symbol}" simgesi bulunmamalıdır.',
		dot: '".", "{domain}" adı içinde yanlış bir konumda kullanılmış.',
		other: 'Lütfen e-posta adresi girin.',
	},
	uk: {
		missingAt:
			'Електронна адреса має містити знак "@". В електронній адресі "{value}" знака "@" немає.',
		noLocal:
			'Введіть частину електронної адреси до знака "@". Електронна адреса "{value}" неповна.',
		noDomain:
			'Введіть частину електронної адреси після знака "@". Електронна адреса "{value}" неповна.',
		localSymbol: 'Частина перед знаком "@" не може містити символ "{symbol}".',
		domainSymbol: 'Частина після знака "@" не може містити символ "{symbol}".',
		dot: 'Символ "." у "{domain}" використано неправильно.',
		other: 'Введіть електронну адресу.',
	},
	ur: {
		missingAt: "براہ کرم ای میل پتہ میں ایک '@' شامل کریں۔ '{value}' میں '@' غائب ہے۔",
		noLocal: "براہ کرم '@' کے بعد ایک حصہ درج کریں۔ '{value}' نامکمل ہے۔",
		noDomain: "براہ کرم '@' کے بعد ایک حصہ درج کریں۔ '{value}' نامکمل ہے۔",
		localSymbol: "'@' کے بعد ایک حصہ میں علامت '{symbol}' شامل نہیں ہونی چاہیے۔",
		domainSymbol: "'@' کے بعد کے حصہ میں علامت '{symbol}' شامل نہیں ہونی چاہیے۔",
		dot: "'.' کا استعمال '{domain}' میں ایک غلط پوزیشن پر ہوا ہے۔",
		other: 'براہ کرم ایک ای میل پتہ درج کریں۔',
	},
	vi: {
		missingAt: "Vui lòng bao gồm '@' trong địa chỉ email. '{value}' bị thiếu '@'.",
		noLocal: "Vui lòng nhập phần đứng trước '@'. '{value}' không hoàn chỉnh.",
		noDomain: "Vui lòng nhập phần đứng sau '@'. '{value}' không hoàn chỉnh.",
		localSymbol: "Phần đứng trước '@' không được chứa biểu tượng '{symbol}'.",
		domainSymbol: "Phần đứng sau '@' không được chứa biểu tượng '{symbol}'.",
		dot: "'.' bị sử dụng sai vị trí trong '{domain}'.",
		other: 'Vui lòng nhập địa chỉ email.',
	},
	'zh-CN': {
		missingAt: '请在电子邮件地址中包括“@”。“{value}”中缺少“@”。',
		noLocal: '请在“@”前面输入内容。“{value}”不完整。',
		noDomain: '请在“@”后面输入内容。“{value}”不完整。',
		localSymbol: '“@”前面的内容不应包含符号“{symbol}”。',
		domainSymbol: '“@”后面的内容不应包含符号“{symbol}”。',
		dot: '“{domain}”中“.”的位置不正确。',
		other: '请输入电子邮件地址。',
	},
	'zh-TW': {
		missingAt: '請在電子郵件地址中包含「@」。「{value}」未包含「@」。',
		noLocal: '請輸入「@」後面的部分。「{value}」不是完整值。',
		noDomain: '請輸入「@」後面的部分。「{value}」不是完整值。',
		localSymbol: '「@」後面的部分不應包含「{symbol}」符號。',
		domainSymbol: '「@」後面的部分不應包含「{symbol}」符號。',
		dot: '「.」未放在「{domain}」的正確位置。',
		other: '請輸入電子郵件地址。',
	},
};

/** The label Chromium draws on an `<input type="submit">` with no `value`. */
export const NATIVE_SUBMIT_LABEL_BY_LOCALE: Readonly<Record<string, string>> = {
	af: 'Dien in',
	am: 'አስገባ',
	ar: 'إرسال',
	bg: 'Изпращане',
	bn: 'জমা দিন',
	ca: 'Envia',
	cs: 'Odeslat',
	da: 'Send',
	de: 'Senden',
	el: 'Υποβολή',
	en: 'Submit',
	'en-GB': 'Submit',
	es: 'Enviar',
	'es-419': 'Enviar',
	et: 'Esita',
	fa: 'ارسال',
	fi: 'Lähetä',
	fil: 'Isumite',
	fr: 'Envoyer',
	gu: 'સબમિટ કરો',
	he: 'שליחה',
	hi: 'सबमिट करें',
	hr: 'Pošalji',
	hu: 'Küldés',
	id: 'Kirim',
	it: 'Invia',
	ja: '送信',
	kn: 'ಸಲ್ಲಿಸಿ',
	ko: '제출',
	lt: 'Pateikti',
	lv: 'Iesniegt',
	ml: 'സമര്‍പ്പിക്കുക',
	mr: 'सबमिट करा',
	ms: 'Serah',
	nb: 'Send inn',
	nl: 'Verzenden',
	pl: 'Prześlij',
	'pt-BR': 'Enviar',
	'pt-PT': 'Enviar',
	ro: 'Trimite',
	ru: 'Отправить',
	sk: 'Odoslať',
	sl: 'Pošlji',
	sr: 'Пошаљи',
	sv: 'Skicka',
	sw: 'Wasilisha',
	ta: 'சமர்ப்பி',
	te: 'సమర్పించు',
	th: 'ส่ง',
	tr: 'Gönder',
	uk: 'Надіслати',
	ur: 'جمع کرائیں',
	vi: 'Gửi',
	'zh-CN': '提交',
	'zh-TW': '提交',
};
