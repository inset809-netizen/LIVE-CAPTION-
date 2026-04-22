// ── DOM ──
const captionArea  = document.getElementById('captionArea');
const modeSelector = document.getElementById('modeSelector');
const parasInner   = document.getElementById('parasInner');
const parasOuter   = document.getElementById('parasOuter');
const scrollHint   = document.getElementById('scrollHint');
const paraCount    = document.getElementById('paraCount');
const backBtn      = document.getElementById('backBtn');
const dirHud       = document.getElementById('dirHud');
const langBadge    = document.getElementById('langBadge');
const wCount       = document.getElementById('wCount');
const wHud         = document.getElementById('wHud');
const stopBtn      = document.getElementById('stopBtn');
const muteBtn      = document.getElementById('muteBtn');
const muteLbl      = document.getElementById('muteLbl');
const tabLiveBtn   = document.getElementById('tabLiveBtn');
const clearBtn     = document.getElementById('clearBtn');
const restartBtn   = document.getElementById('restartBtn');
const notif        = document.getElementById('notif');
const sourceTag    = document.getElementById('sourceTag');
const modeLabel    = document.getElementById('modeLabel');
const micDot       = document.getElementById('micDot');
const lblLeft      = document.getElementById('lblLeft');
const lblRight     = document.getElementById('lblRight');
const btnMic       = document.getElementById('btnMic');
const btnTab       = document.getElementById('btnTab');
const langModePill = document.getElementById('langModePill');
const lmBtnEs      = document.getElementById('lmBtnEs');
const lmBtnEn      = document.getElementById('lmBtnEn');

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ── State ──
let recognition    = null;
let isRunning      = false;
let isMuted        = false;
let tabStream      = null;
let micStream      = null;
let micAudioCtx    = null;
let currentRecLang = 'es-US';
let wordTotal      = 0;
let lastTranslated = '';
let retryDelay     = 400;
let notifTimer     = null;
let txAbort        = null;
let txDebounce     = null;

// Modo de reconocimiento: 'es' | 'auto' | 'en'
let langMode = 'auto';

// Detectar idioma del navegador para preferencia inicial
const browserLangRaw = (navigator.language || 'en').toLowerCase();
let preferredRecLang = browserLangRaw.startsWith('es') ? 'es' : 'en';

// ── Locales ES con fallback ──
// es-US: mejor para caribeño/latinoamericano | es-419: América Latina general | es-MX: fallback
const ES_LOCALES = ['es-US', 'es-419', 'es-MX', 'es-ES'];
let esLocaleIdx = 0;
function getESLocale(){ return ES_LOCALES[esLocaleIdx % ES_LOCALES.length]; }

// ── Cambio de idioma cooldown ──
let lastLangSwitch = 0;
const SWITCH_COOLDOWN = 850;

// ── Paragraph state ──
let paragraphs     = [];
let currentParaIdx = -1;
let pendingNewPara = false;
let silenceTimer   = null;
const SILENCE_MS   = 1700;

let isManualScroll = false;

// ── Lang mode UI ──
function setLangMode(mode, silent){
  // Solo ES o EN (sin auto)
  if(mode === 'auto') mode = 'es';
  langMode = mode;
  [lmBtnEs, lmBtnEn].forEach(b => b.classList.remove('active'));
  if(mode === 'es'){
    lmBtnEs.classList.add('active');
    langModePill.textContent = 'ES'; langModePill.className = 'lang-mode-pill show lm-es';
  } else {
    lmBtnEn.classList.add('active');
    langModePill.textContent = 'EN'; langModePill.className = 'lang-mode-pill show lm-en';
  }
  if(!silent && isRunning && !isMuted){
    const sl = mode === 'en' ? 'en' : 'es';
    startRec(sl);
    showNotif('MODO: ' + mode.toUpperCase(), 2200);
  }
}

lmBtnEs.addEventListener('click',   () => setLangMode('es'));
lmBtnEn.addEventListener('click',   () => setLangMode('en'));

langModePill.addEventListener('click', () => {
  if(langMode === 'es') setLangMode('en');
  else setLangMode('es');
});

// ── Notificaciones ──
function showNotif(msg, dur=3500){
  notif.textContent = msg; notif.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => notif.classList.remove('show'), dur);
}

// ── DETECCIÓN DE IDIOMA MEJORADA ──
// Normaliza acentos para que palabras como "también", "más", "están" sean detectadas
function normStr(t){
  return t.toLowerCase()
    .replace(/[áàãä]/g,'a').replace(/[éèë]/g,'e')
    .replace(/[íìï]/g,'i').replace(/[óòõö]/g,'o')
    .replace(/[úùü]/g,'u').replace(/[ñ]/g,'n');
}

// ── LÉXICO ESPAÑOL AMPLIADO + VOCABULARIO MÉDICO COMPLETO ──
const ES_RX = /\b(el|los|las|una|del|que|con|por|para|como|pero|mas|este|esta|estos|estas|hay|tengo|hola|gracias|bien|muy|soy|estan|son|tienen|porque|cuando|tambien|todo|puede|quiero|hacer|tiempo|vida|mundo|mucho|poco|donde|siempre|nunca|ahora|despues|antes|entre|sobre|hasta|desde|durante|mientras|aunque|sino|incluso|ademas|sin|solo|cada|otro|otra|yo|ella|nosotros|ellos|ellas|usted|ustedes|quien|cual|ese|eso|esa|fue|ser|estar|tener|decir|saber|querer|llegar|pasar|deber|poner|parecer|quedar|creer|hablar|llevar|dejar|seguir|encontrar|llamar|venir|pensar|salir|volver|tomar|conocer|vivir|sentir|tratar|mirar|contar|empezar|esperar|buscar|entrar|trabajar|escribir|perder|entender|pedir|recibir|recordar|terminar|permitir|aparecer|conseguir|comenzar|servir|sacar|necesitar|mantener|cambiar|crear|abrir|ganar|formar|traer|morir|aceptar|realizar|comprender|lograr|explicar|preguntar|reconocer|estudiar|nacer|correr|usar|valer|me|te|se|nos|le|les|mi|su|mis|sus|nuestro|nuestra|al|lo|ha|han|he|hemos|era|eran|estaba|estoy|estamos|fui|fuiste|fuimos|fueron|tenia|tienes|tiene|tenemos|hago|hace|hacemos|digo|dice|voy|vas|va|vamos|van|quiero|quieres|quiere|queremos|bueno|buena|buenos|malo|mala|grande|nuevo|nueva|primero|primera|segundo|ultima|todos|todas|nada|algo|alguien|nadie|hoy|ayer|luego|casi|tan|tanto|igual|varios|algunas|ninguno|aqui|alli|alla|pues|claro|entonces|oye|mira|dale|vale|chevere|listo|vaina|verdad|gente|cosa|vez|dia|mes|hora|parte|lugar|forma|tipo|caso|punto|nombre|grupo|hecho|nino|noche|tarde|semana|ciudad|minuto|letra|libro|ropa|carro|calle|tienda|escuela|iglesia|hospital|oficina|puerta|ventana|mesa|silla|cama|dinero|trabajo|familia|mama|papa|hermano|hermana|amigo|amiga|senor|senora|muchacho|muchacha|chico|chica|buenas|buenos dias|buenas noches|hasta luego|de nada|estoy|estamos|estaban|habla|hablo|hablamos|vamos a|hay que|tiene que|tengo que|quiero que|para que|a ver|tal vez|quizas|ojala|por supuesto|desde luego|lo que|lo mismo|eso es|eso si|nada mas|pero que|y que|o que|no hay|no es|si hay|aqui esta|donde esta|como esta|que tal|que paso|que es|que fue|quien es|cuando es|porque es|para eso|para mi|para el|para ella|estaba bien|muy bien|muy malo|bastante|dolor|fiebre|nauseas|vomito|mareo|desmayo|convulsion|temblor|fatiga|cansancio|debilidad|inflamacion|hinchazon|picazon|ardor|hormigueo|entumecimiento|rigidez|espasmo|sangrado|hemorragia|tos|disnea|ahogo|palpitaciones|taquicardia|bradicardia|hipertension|hipotension|vertigo|cefalea|migrana|insomnio|somnolencia|confusion|desorientacion|agitacion|ansiedad|depresion|alucinaciones|disfagia|acidez|reflujo|distension|estrenimiento|diarrea|incontinencia|disuria|hematuria|prurito|exantema|urticaria|edema|cianosis|ictericia|palidez|deshidratacion|sudoracion|corazon|pulmon|higado|rinon|cerebro|hueso|musculo|nervio|vena|arteria|sangre|piel|tejido|celula|organo|columna|vertebra|costilla|craneo|pelvis|femur|tibia|perone|humero|radio|cubito|clavicula|esternon|mandibula|rodilla|codo|hombro|tobillo|muneca|cadera|medula|torax|abdomen|membrana|cartilago|ligamento|tendon|fascia|traquea|esofago|estomago|intestino|colon|recto|vejiga|utero|ovario|testiculo|prostata|tiroides|suprarrenal|pancreas|bazo|vesicula|apendice|nodulo|medula osea|retina|cornea|coclea|cardiovascular|respiratorio|digestivo|nervioso|endocrino|inmune|musculoesqueletico|reproductivo|urinario|linfatico|diabetes|hipertension|cancer|tumor|carcinoma|leucemia|linfoma|asma|bronquitis|neumonia|tuberculosis|enfisema|fibrosis|infarto|angina|arritmia|insuficiencia|aterosclerosis|trombosis|embolia|derrame|ictus|epilepsia|alzheimer|parkinson|esclerosis|lupus|artritis|osteoporosis|escoliosis|hernia|apendicitis|colitis|gastritis|ulcera|cirrosis|hepatitis|pancreatitis|nefrolitiasis|hipotiroidismo|hipertiroidismo|anemia|hemofilia|sepsis|shock|meningitis|encefalitis|poliomielitis|influenza|dengue|malaria|vih|sida|infeccion|bacteria|virus|parasito|hongo|absceso|celulitis|psoriasis|eczema|melanoma|glaucoma|cataratas|conjuntivitis|otitis|rinitis|sinusitis|faringitis|amigdalitis|laringitis|endocarditis|pericarditis|miocarditis|vasculitis|fibromialgia|bipolar|esquizofrenia|autismo|demencia|hipotiroidismo|celiaca|crohn|colon irritable|cirugia|operacion|intervencion|biopsia|endoscopia|colonoscopia|laparoscopia|artroscopia|trasplante|dialisis|quimioterapia|radioterapia|inmunoterapia|angioplastia|bypass|cateterismo|ablacion|amputacion|colostomia|traqueotomia|intubacion|ventilacion|reanimacion|rcp|desfibrilacion|cardioversion|marcapasos|sutura|drenaje|puncion|aspiracion|irrigacion|vendaje|yeso|ferula|vacuna|transfusion|hemotransfusion|plasma|medicamento|farmaco|medicacion|tratamiento|terapia|pastilla|tableta|capsula|jarabe|suspension|inyeccion|ampolla|suero|solucion|crema|pomada|unguento|parche|inhalador|nebulizador|antibiotico|analgesico|antipiretico|antiinflamatorio|antihistaminico|antihipertensivo|antidiabetico|antidepresivo|ansiolitico|sedante|somnifero|diuretico|laxante|antiacido|broncodilatador|corticoide|inmunosupresor|anticoagulante|estatina|betabloqueante|inhibidor|hormona|insulina|metformina|aspirina|ibuprofeno|paracetamol|acetaminofen|morfina|codeina|tramadol|fentanilo|lidocaina|anestesia|profilaxis|dosis|sobredosis|contraindicacion|efecto secundario|interaccion|alergico|sensibilidad|tolerancia|dependencia|diagnostico|prueba|examen|analisis|laboratorio|resultado|muestra|histologia|citologia|radiografia|rayos|tomografia|resonancia|ecografia|ultrasonido|electrocardiograma|ekg|eeg|espirometria|ecocardiograma|densitometria|gammagrafia|scanner|contraste|medicion|valor|rango|normal|anormal|positivo|negativo|reactivo|cultivo|panel|diferencial|medico|doctor|doctora|enfermera|enfermero|cirujano|cirujana|especialista|internista|pediatra|cardiologo|neurologo|oncologo|ortopeda|traumatologo|ginecologo|obstetra|dermatologo|oftalmologo|otorrinolaringologo|urologo|nefrologo|hepatologo|gastroenterologo|neumólogo|reumatologo|endocrinologo|hematologo|infectologo|radiologo|patologo|anestesiologo|intensivista|farmaceutico|fisioterapeuta|nutricionista|psicologo|psiquiatra|trabajador social|emergencias|urgencias|guardia|unidad|uci|quirofano|consultorio|clinica|ambulancia|camilla|expediente|historia clinica|epicrisis|alta medica|referimiento|interconsulta|consentimiento|prognosis|pronostico|receta|formulario|seguro|cita|turno|ingreso|egreso|sala de espera|triage|signos vitales|tension arterial|frecuencia cardiaca|frecuencia respiratoria|temperatura|saturacion|oxigeno|glucosa|hemoglobina|plaquetas|leucocitos|eritrocitos|hematocrito|creatinina|urea|acido urico|colesterol|trigliceridos|albumina|bilirrubina|transaminasas|enzimas|hormona|anticuerpo|antigeno|inmunoglobulina|proteina|electrolito|sodio|potasio|calcio|magnesio|fosforo|cloro|bicarbonato|ph|gasometria|gram|cultivo|antibiograma|sensibilidad|resistencia|cepa|patogeno|microorganismo|microbioma|flora|esteril|aseptico|desinfeccion|esterilizacion|aislamiento|cuarentena|contagio|epidemia|pandemia|brote|zoonosis|vector|huesped|incubacion|periodo|transmision|prevencion|vacunacion|inmunizacion|herd immunity|cobertura|seroprevalencia|vigilancia|epidemiologia|salud publica|intervencion|cuidados paliativos|hospicio|terminal|cuidados intensivos|reanimacion cardiopulmonar|desfibrilador|monitor|ventilador|cateter|sonda|drena|vendaje|apósito|esteril|bioequivalente|generico|marca|principio activo|excipiente|via oral|via intravenosa|via intramuscular|via subcutanea|via topica|via inhalatoria|absorcion|distribucion|metabolismo|eliminacion|farmacocinetica|farmacodinamia|receptor|agonista|antagonista|sinergismo|antagonismo|interaccion medicamentosa|polifarmacia|adherencia|cumplimiento|seguimiento|control|monitoreo|ajuste|titulacion|suspension|discontinuacion|reaccion adversa|efecto indeseable|contraindicacion|precaucion|advertencia|caja negra|fda|cofepris|invima|cecmed|digemid)\b/gi;

// ── LÉXICO INGLÉS AMPLIADO + VOCABULARIO MÉDICO COMPLETO ──
const EN_RX = /\b(the|and|that|this|with|have|from|they|been|were|will|would|could|should|there|their|what|when|where|which|about|after|before|being|between|during|through|without|because|although|however|therefore|another|something|anything|everything|nothing|someone|anyone|everyone|nobody|everybody|already|always|never|often|sometimes|usually|really|actually|probably|definitely|basically|literally|obviously|clearly|certainly|generally|specifically|especially|particularly|currently|recently|finally|suddenly|quickly|slowly|easily|simply|truly|exactly|nearly|almost|quite|rather|whether|neither|either|unless|until|while|since|both|each|every|such|much|more|most|less|least|many|few|some|any|all|other|another|same|different|important|necessary|possible|available|various|several|certain|whole|entire|main|major|large|small|great|good|bad|new|old|young|first|last|next|best|worst|right|wrong|true|false|real|high|low|long|short|hard|easy|free|open|close|full|empty|clear|dark|light|fast|slow|strong|weak|hot|cold|warm|cool|early|late|soon|yet|still|just|even|also|too|very|so|well|then|now|here|please|thank|thanks|sorry|hello|goodbye|okay|sure|yes|absolutely|indeed|perhaps|maybe|likely|within|among|along|across|around|above|below|behind|beside|beyond|despite|except|instead|whereas|meanwhile|furthermore|moreover|otherwise|nevertheless|regardless|herself|himself|itself|myself|yourself|ourselves|themselves|enough|half|whatever|whichever|whoever|wherever|whenever|however|gonna|wanna|gotta|yeah|nope|yep|nah|hey|wow|hmm|like|ok|totally|seriously|honestly|pretty|fairly|extremely|incredibly|unfortunately|fortunately|apparently|essentially|fundamentally|primarily|largely|mostly|mainly|typically|normally|naturally|certainly|possibly|presumably|pain|fever|nausea|vomiting|dizziness|fainting|seizure|tremor|fatigue|weakness|swelling|redness|warmth|itching|burning|numbness|tingling|stiffness|spasm|bleeding|hemorrhage|cough|sputum|dyspnea|breathlessness|palpitations|tachycardia|bradycardia|hypertension|hypotension|tinnitus|vertigo|headache|migraine|insomnia|drowsiness|confusion|disorientation|agitation|anxiety|depression|hallucinations|dysphagia|heartburn|reflux|bloating|constipation|diarrhea|incontinence|dysuria|hematuria|rash|urticaria|edema|cyanosis|jaundice|pallor|dehydration|diaphoresis|sweating|shortness|breath|chest|pressure|tight|stabbing|throbbing|sharp|dull|aching|crushing|burning|radiating|intermittent|constant|acute|chronic|mild|moderate|severe|onset|duration|frequency|location|radiation|alleviating|aggravating|heart|lung|liver|kidney|brain|bone|muscle|nerve|vein|artery|blood|skin|tissue|cell|organ|spine|vertebra|rib|skull|pelvis|femur|tibia|fibula|humerus|radius|ulna|clavicle|sternum|mandible|knee|elbow|shoulder|ankle|wrist|hip|spinal|thorax|abdomen|membrane|cartilage|ligament|tendon|fascia|trachea|esophagus|stomach|intestine|colon|rectum|bladder|uterus|ovary|testis|prostate|thyroid|adrenal|pancreas|spleen|gallbladder|appendix|lymph|marrow|retina|cornea|cochlea|aorta|atrium|ventricle|mitral|aortic|tricuspid|pulmonary|coronary|carotid|femoral|jugular|subclavian|iliac|renal|hepatic|portal|mesenteric|cerebral|frontal|parietal|temporal|occipital|cerebellum|brainstem|hypothalamus|pituitary|hippocampus|tonsil|adenoid|thymus|spleen|lymph node|diabetes|hypertension|cancer|tumor|carcinoma|leukemia|lymphoma|asthma|bronchitis|pneumonia|tuberculosis|emphysema|fibrosis|infarction|angina|arrhythmia|insufficiency|atherosclerosis|thrombosis|embolism|stroke|epilepsy|alzheimer|parkinson|sclerosis|lupus|arthritis|osteoporosis|scoliosis|hernia|appendicitis|colitis|gastritis|ulcer|cirrhosis|hepatitis|pancreatitis|nephrolithiasis|hypothyroidism|hyperthyroidism|anemia|hemophilia|sepsis|shock|meningitis|encephalitis|polio|influenza|dengue|malaria|hiv|aids|infection|bacteria|virus|parasite|fungus|abscess|cellulitis|psoriasis|eczema|melanoma|glaucoma|cataracts|conjunctivitis|otitis|rhinitis|sinusitis|pharyngitis|tonsillitis|laryngitis|endocarditis|pericarditis|myocarditis|vasculitis|fibromyalgia|bipolar|schizophrenia|autism|dementia|adhd|celiac|crohn|gerd|barrett|obesity|metabolic|syndrome|covid|influenza|respiratory|cardiovascular|neurological|musculoskeletal|autoimmune|congenital|hereditary|genetic|acquired|infectious|inflammatory|degenerative|malignant|benign|surgery|operation|procedure|biopsy|endoscopy|colonoscopy|laparoscopy|arthroscopy|transplant|dialysis|chemotherapy|radiation|immunotherapy|angioplasty|bypass|catheterization|ablation|amputation|colostomy|tracheotomy|intubation|ventilation|resuscitation|cpr|defibrillation|cardioversion|pacemaker|suture|drainage|puncture|aspiration|irrigation|reduction|immobilization|bandage|cast|splint|injection|vaccination|transfusion|infusion|medication|drug|medicine|treatment|therapy|pill|tablet|capsule|syrup|suspension|serum|solution|cream|ointment|patch|inhaler|nebulizer|antibiotic|analgesic|antipyretic|anti-inflammatory|antihistamine|antihypertensive|antidiabetic|antidepressant|anxiolytic|sedative|diuretic|laxative|antiemetic|antacid|bronchodilator|corticosteroid|immunosuppressant|anticoagulant|statin|beta-blocker|inhibitor|hormone|insulin|metformin|aspirin|ibuprofen|acetaminophen|morphine|codeine|tramadol|fentanyl|lidocaine|anesthesia|prophylaxis|dosage|overdose|contraindication|side effect|interaction|allergy|sensitivity|tolerance|dependence|diagnosis|test|examination|analysis|laboratory|result|sample|histology|cytology|x-ray|tomography|mri|ultrasound|ecg|ekg|eeg|emg|spirometry|echocardiogram|densitometry|scan|contrast|measurement|value|range|normal|abnormal|positive|negative|reactive|culture|susceptibility|panel|workup|differential|physician|doctor|nurse|surgeon|specialist|internist|pediatrician|cardiologist|neurologist|oncologist|orthopedist|traumatologist|gynecologist|obstetrician|dermatologist|ophthalmologist|otolaryngologist|urologist|nephrologist|hepatologist|gastroenterologist|pulmonologist|rheumatologist|endocrinologist|hematologist|radiologist|pathologist|anesthesiologist|intensivist|resident|intern|attending|pharmacist|therapist|nutritionist|psychologist|psychiatrist|social worker|hospital|clinic|office|emergency|urgent|icu|ward|operating|pharmacy|ambulance|stretcher|chart|record|discharge|referral|consult|consent|prognosis|prescription|insurance|appointment|admission|triage|vital signs|blood pressure|heart rate|respiratory rate|temperature|saturation|oxygen|glucose|hemoglobin|platelets|white blood|red blood|hematocrit|creatinine|urea|uric acid|cholesterol|triglycerides|albumin|bilirubin|transaminase|enzyme|antibody|antigen|immunoglobulin|protein|electrolyte|sodium|potassium|calcium|magnesium|phosphorus|chloride|bicarbonate|ph|blood gas|gram stain|antibiogram|resistance|strain|pathogen|microorganism|microbiome|flora|sterile|aseptic|disinfection|sterilization|isolation|quarantine|contagion|epidemic|pandemic|outbreak|zoonosis|vector|host|incubation|transmission|prevention|immunization|coverage|seroprevalence|surveillance|epidemiology|public health|palliative|hospice|terminal|intensive|cardiopulmonary|defibrillator|monitor|ventilator|catheter|probe|drain|dressing|bioequivalent|generic|brand|active ingredient|oral|intravenous|intramuscular|subcutaneous|topical|inhalation|absorption|distribution|metabolism|elimination|pharmacokinetics|pharmacodynamics|receptor|agonist|antagonist|synergism|polypharmacy|adherence|compliance|monitoring|adjustment|titration|discontinuation|adverse reaction|contraindication|precaution|warning)\b/gi;

function detectLanguage(text){
  if(!text || text.trim().length < 2) return preferredRecLang;
  const norm = normStr(text);
  const words = norm.trim().split(/\s+/).filter(Boolean);
  const w = words.length;
  if(w === 0) return preferredRecLang;

  // Contar matches de cada idioma
  const esMatches = (norm.match(ES_RX) || []).length;
  const enMatches = (norm.match(EN_RX) || []).length;

  // Si langMode es forzado, usarlo siempre (sin override)
  if(langMode === 'es') return 'es';
  if(langMode === 'en') return 'en';

  // Detección por ratio
  if(w === 1){
    if(esMatches >= 1 && enMatches === 0) return 'es';
    if(enMatches >= 1 && esMatches === 0) return 'en';
    return preferredRecLang;
  }
  if(w <= 3){
    if(esMatches > enMatches) return 'es';
    if(enMatches > esMatches) return 'en';
    return preferredRecLang;
  }

  // Texto más largo: comparación por ratio ponderado
  const esRatio = esMatches / w;
  const enRatio = enMatches / w;

  // Umbral mínimo de 0.05 (5%) para clasificar
  const MIN = 0.05;
  if(esRatio < MIN && enRatio < MIN) return preferredRecLang;
  if(esRatio >= MIN && enRatio < MIN) return 'es';
  if(enRatio >= MIN && esRatio < MIN) return 'en';

  // Ambos superan el umbral → gana el mayor con ventaja clara
  if(esRatio > enRatio * 1.2) return 'es';
  if(enRatio > esRatio * 1.2) return 'en';

  // Empate técnico → preferir el idioma actual para evitar switches
  return preferredRecLang;
}

// ── UI Labels ──
function updateLangUI(lang){
  if(lang === 'en'){
    dirHud.textContent = 'EN → ES';
    langBadge.textContent = 'EN'; langBadge.className = 'lang-badge show en';
    lblLeft.textContent  = 'EN'; lblLeft.className  = 'col-header en-lbl';
    lblRight.textContent = 'ES'; lblRight.className = 'col-header es-lbl';
  } else {
    dirHud.textContent = 'ES → EN';
    langBadge.textContent = 'ES'; langBadge.className = 'lang-badge show es';
    lblLeft.textContent  = 'ES'; lblLeft.className  = 'col-header es-lbl';
    lblRight.textContent = 'EN'; lblRight.className = 'col-header en-lbl';
  }
  if(currentParaIdx >= 0){
    const tr = document.getElementById(`para-trans-${currentParaIdx}`);
    if(tr) tr.className = lang === 'en' ? 'para-right es-output' : 'para-right en-output';
  }
}

// ── Párrafos ──
function createPara(lang='en'){
  const id = paragraphs.length;
  paragraphs.push({orig:'', trans:'', lang});
  currentParaIdx = id;

  const row   = document.createElement('div');
  row.className = 'para-row current';
  row.id = `para-row-${id}`;

  const left  = document.createElement('div');
  left.className = 'para-left';
  left.id = `para-orig-${id}`;

  const sep = document.createElement('div');
  sep.className = 'para-vsep';

  const right = document.createElement('div');
  right.className = 'para-right ' + (lang === 'en' ? 'es-output' : 'en-output');
  right.id = `para-trans-${id}`;

  row.appendChild(left); row.appendChild(sep); row.appendChild(right);
  parasInner.appendChild(row);
  refreshParaAges();
  updateParaCount();
  autoScrollToBottom();
  return id;
}

function refreshParaAges(){
  const rows = parasInner.querySelectorAll('.para-row');
  const n = rows.length;
  rows.forEach((row, i) => {
    const age = n - 1 - i;
    row.className = 'para-row';
    if(age === 0) row.classList.add('current');
    else if(age === 1) row.classList.add('age-1');
    else row.classList.add('age-old');
  });
}

function updateParaCount(){
  const n = paragraphs.length;
  paraCount.textContent = n > 1 ? `${n} PÁRR` : '';
}

function getCurrentOrigEl(){  return currentParaIdx >= 0 ? document.getElementById(`para-orig-${currentParaIdx}`) : null; }
function getCurrentTransEl(){ return currentParaIdx >= 0 ? document.getElementById(`para-trans-${currentParaIdx}`) : null; }

// ── Scroll ──
function autoScrollToBottom(){
  if(isManualScroll) return;
  parasInner.scrollTop = parasInner.scrollHeight;
  updateScrollUI();
}
function updateScrollUI(){
  const atBottom = parasInner.scrollTop >= parasInner.scrollHeight - parasInner.clientHeight - 40;
  const hasAbove = parasInner.scrollTop > 30;
  scrollHint.classList.toggle('show', hasAbove);
  backBtn.classList.toggle('show', isManualScroll);
  parasInner.classList.toggle('history-mode', isManualScroll);
}

captionArea.addEventListener('wheel', (e) => {
  e.preventDefault(); parasInner.scrollTop += e.deltaY;
  isManualScroll = !(parasInner.scrollTop >= parasInner.scrollHeight - parasInner.clientHeight - 40);
  updateScrollUI();
}, {passive:false});

parasOuter.addEventListener('wheel', (e) => {
  e.preventDefault(); parasInner.scrollTop += e.deltaY;
  isManualScroll = !(parasInner.scrollTop >= parasInner.scrollHeight - parasInner.clientHeight - 40);
  updateScrollUI();
}, {passive:false});

parasInner.addEventListener('scroll', () => {
  if(parasInner.scrollTop >= parasInner.scrollHeight - parasInner.clientHeight - 40) isManualScroll = false;
  updateScrollUI();
});

backBtn.addEventListener('click', () => {
  isManualScroll = false;
  parasInner.scrollTop = parasInner.scrollHeight;
  updateScrollUI();
});

// ── Clear ──
function clearAll(){
  paragraphs = []; currentParaIdx = -1; pendingNewPara = false;
  wordTotal = 0; lastTranslated = '';
  clearTimeout(silenceTimer); isManualScroll = false;
  parasInner.innerHTML = '';
  wCount.textContent = '0 PALABRAS'; wHud.textContent = '0 W';
  updateParaCount(); updateScrollUI();
}

// ── Traducción ──
async function translateNow(text, fromLang){
  if(txAbort){ txAbort.abort(); txAbort = null; }
  const ctrl = new AbortController(); txAbort = ctrl;
  const sig  = ctrl.signal;
  const tl   = fromLang === 'en' ? 'es' : 'en';
  const chunk = text.slice(-380).trim();
  if(!chunk || sig.aborted) return;

  const transEl = getCurrentTransEl();
  if(transEl) transEl.innerHTML = '<span class="translating">·&nbsp;·&nbsp;·</span>';

  // PRIMARY: Google Translate (con sl explícito para mejor precisión)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${tl}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url, {signal: sig});
    const d   = await res.json();
    if(sig.aborted) return;
    if(d && d[0]){
      const result = d[0].map(s => s?.[0] || '').join('').trim();
      if(result){
        const el = getCurrentTransEl();
        if(el && !sig.aborted) el.textContent = result;
        if(currentParaIdx >= 0) paragraphs[currentParaIdx].trans = result;
        lastTranslated = result; return;
      }
    }
  } catch(e){ if(sig.aborted) return; }

  // FALLBACK: MyMemory
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${fromLang}|${tl}`,
      {signal: sig}
    );
    const d = await res.json();
    if(sig.aborted) return;
    if(d.responseStatus === 200 && d.responseData?.translatedText){
      const tx = d.responseData.translatedText;
      if(!tx.startsWith('MYMEMORY WARNING')){
        const el = getCurrentTransEl();
        if(el && !sig.aborted) el.textContent = tx;
        if(currentParaIdx >= 0) paragraphs[currentParaIdx].trans = tx;
        lastTranslated = tx; return;
      }
    }
  } catch(e){ if(sig.aborted) return; }

  const el = getCurrentTransEl();
  if(!sig.aborted && el) el.textContent = lastTranslated || '—';
}

function scheduleTranslate(text, lang){
  clearTimeout(txDebounce);
  txDebounce = setTimeout(() => translateNow(text, lang), 90);
}

// ── Mic keepalive ──
let micGainNode = null;

// ── MIC STREAM PERMANENTE ──
// Una vez que el usuario da permiso, el stream físico del micrófono
// se mantiene vivo CON GAIN=0 durante toda la sesión.
// Esto evita que el navegador muestre el indicador "mic liberado"
// al cambiar idioma o mutear. Solo se libera en stopAll() o al cerrar la página.
async function keepMicAlive(){
  if(micStream) return;
  try{
    micStream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
    micAudioCtx = new AudioContext();
    const src = micAudioCtx.createMediaStreamSource(micStream);
    micGainNode = micAudioCtx.createGain();
    micGainNode.gain.value = 0; // silencio total, solo mantiene el permiso activo
    src.connect(micGainNode);
    // NO conectar a destination para no reproducir el audio
  } catch(e){ console.warn('keepMicAlive:', e); }
}

function releaseMic(){
  if(micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream = null; }
  if(micAudioCtx){ try{ micAudioCtx.close(); }catch(x){} micAudioCtx = null; }
  micGainNode = null;
}

// ── MOTOR DE RECONOCIMIENTO MEJORADO ──
// PRINCIPIO CLAVE: el SpeechRecognition se reinicia solo cuando es necesario
// (cambio de idioma, onend natural). NUNCA liberamos el micStream físico
// por mutear o cambiar idioma — eso lo sigue Chrome como permiso activo.
function getEffectiveLang(hint){
  if(langMode === 'es') return 'es';
  if(langMode === 'en') return 'en';
  return hint || preferredRecLang;
}

function startRec(lang){
  if(!SR || !isRunning || isMuted) return;

  const eff = getEffectiveLang(lang);

  // Detener instancia anterior SIN liberar el micStream físico.
  // recognition.abort() solo cierra la instancia del API de reconocimiento,
  // no el MediaStream que tenemos en keepMicAlive (esos son independientes).
  if(recognition){
    recognition.onend = null; recognition.onerror = null; recognition.onresult = null;
    try{ recognition.abort(); }catch(x){}
    recognition = null;
  }

  const locale = eff === 'es' ? getESLocale() : 'en-US';

  recognition = new SR();
  recognition.lang            = locale;
  currentRecLang              = locale;
  recognition.continuous      = true;
  recognition.interimResults  = true;
  recognition.maxAlternatives = 3;

  recognition.onresult = (e) => {
    // Si estamos muteados, ignorar resultados sin tocar el stream
    if(isMuted) return;
    retryDelay = 300;
    let interim = '', newFinal = '';

    for(let i = e.resultIndex; i < e.results.length; i++){
      if(e.results[i].isFinal){
        let best = e.results[i][0].transcript;
        const expectedLang = getEffectiveLang(preferredRecLang);
        if(e.results[i].length > 1){
          for(let a = 0; a < e.results[i].length; a++){
            const alt = e.results[i][a].transcript;
            if(detectLanguage(alt) === expectedLang && detectLanguage(best) !== expectedLang){
              best = alt; break;
            }
          }
        }
        newFinal += best + ' ';
      } else {
        interim += e.results[i][0].transcript;
      }
    }

    if(paragraphs.length === 0 || (pendingNewPara && (newFinal || interim).trim())){
      pendingNewPara = false;
      const dl0 = getEffectiveLang(detectLanguage((newFinal + interim).trim()));
      createPara(dl0);
      updateLangUI(dl0);
    }

    const curPara = paragraphs[currentParaIdx];

    if(newFinal){
      curPara.orig += newFinal;
      wordTotal = paragraphs.reduce((s,p) => s + p.orig.trim().split(/\s+/).filter(Boolean).length, 0);
      wCount.textContent = wordTotal + ' PALABRAS';
      wHud.textContent   = wordTotal + ' W';

      const dl = getEffectiveLang(detectLanguage(curPara.orig.trim()));
      curPara.lang = dl;

      const wc = curPara.orig.trim().split(/\s+/).filter(Boolean).length;
      if(wc >= 2) preferredRecLang = dl;

      updateLangUI(dl);
      scheduleTranslate(curPara.orig.trim(), dl);
    }

    if(interim){
      const live   = ((curPara?.orig||'') + ' ' + interim).trim();
      const dlLive = getEffectiveLang(detectLanguage(live));
      if(!newFinal) updateLangUI(dlLive);
      scheduleTranslate(live, dlLive);
    }

    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { pendingNewPara = true; }, SILENCE_MS);

    const origEl = getCurrentOrigEl();
    if(origEl){
      const finText = curPara.orig;
      let html = '';
      if(finText) html = `<span>${finText}</span>`;
      if(interim)  html += `<span class="interim">${interim}</span>`;
      origEl.innerHTML = html;
      autoScrollToBottom();
    }
  };

  recognition.onend = () => {
    // Auto-reinicio solo si seguimos activos y no muteados
    if(!isRunning || isMuted) return;
    const nextLang = getEffectiveLang(preferredRecLang);
    setTimeout(() => {
      if(!isRunning || isMuted) return;
      startRec(nextLang);
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 1.3, 800);
  };

  recognition.onerror = (e) => {
    if(e.error === 'not-allowed' || e.error === 'service-not-allowed'){
      showNotif('PERMISO DENEGADO — REVISA AJUSTES DEL NAVEGADOR', 6000);
      stopAll(); return;
    }
    if(e.error === 'language-not-supported'){
      esLocaleIdx++;
      showNotif(`LOCALE NO SOPORTADO → INTENTANDO ${getESLocale()}`, 3000);
    }
    if(e.error === 'no-speech') retryDelay = 280;
    if(e.error === 'network')   retryDelay = 600;
  };

  try{ recognition.start(); }catch(x){}
}

// ── Session ──
function setActive(src){
  isRunning = true;
  modeSelector.classList.add('hide');
  captionArea.classList.add('show');
  langBadge.classList.add('show');
  stopBtn.classList.add('show');
  muteBtn.classList.add('show');
  tabLiveBtn.classList.add('show');
  langModePill.classList.add('show');
  modeLabel.textContent = src === 'mic' ? 'MIC' : 'TAB';
  sourceTag.textContent = src === 'mic' ? '— MICRÓFONO —' : '— AUDIO DEL SISTEMA —';
}

function stopAll(){
  isRunning = false; isMuted = false;
  clearTimeout(silenceTimer);
  // Detener el recognition API (no el stream físico del mic)
  if(recognition){
    recognition.onend = null; recognition.onerror = null; recognition.onresult = null;
    try{ recognition.abort(); }catch(x){} recognition = null;
  }
  // Detener tab capture si existe
  if(tabStream){ tabStream.getTracks().forEach(t=>t.stop()); tabStream = null; }
  // Liberar el mic SOLO aquí (parar la sesión = soltar todo)
  releaseMic();
  [stopBtn, muteBtn, tabLiveBtn].forEach(b => b.classList.remove('show'));
  muteBtn.classList.remove('muted'); muteLbl.textContent = 'MUTEAR';
  micDot.classList.remove('pause');
  langModePill.classList.remove('show');
  langBadge.classList.remove('show');
  sourceTag.textContent = '— PAUSADO —'; modeLabel.textContent = 'PAUSED';
  backBtn.classList.remove('show');
  restartBtn.classList.add('show');
  showNotif('SESIÓN PAUSADA · HISTORIAL DISPONIBLE', 4000);
}

// ── Visibility change ──
// Cuando el usuario cambia de pestaña, el SpeechRecognition se puede pausar
// internamente en Chrome, pero NO llamamos stop()/abort() para no soltar el mic.
// Cuando vuelve, reiniciamos el recognition si no estaba muteado.
document.addEventListener('visibilitychange', () => {
  if(!isRunning || isMuted) return;
  if(!document.hidden){
    // Al volver a la pestaña, asegurar que el recognition esté corriendo
    if(!recognition) startRec(getEffectiveLang(preferredRecLang));
  }
});

// ── Tab capture ──
async function startTabCapture(fresh){
  if(!SR){ showNotif('USA CHROME O EDGE'); return; }
  if(!navigator.mediaDevices?.getDisplayMedia){ showNotif('NAVEGADOR NO SOPORTA CAPTURA'); return; }
  try{
    showNotif('SELECCIONA LA PESTAÑA Y ACTIVA ✓ "COMPARTIR AUDIO"', 8000);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {echoCancellation:false, noiseSuppression:false, sampleRate:44100}
    });
    const aTracks = stream.getAudioTracks();
    if(aTracks.length === 0){
      showNotif('SIN AUDIO — ACTIVA "COMPARTIR AUDIO" AL SELECCIONAR', 7000);
      stream.getTracks().forEach(t=>t.stop()); return;
    }
    if(recognition){ try{ recognition.abort(); }catch(x){} recognition=null; }
    if(tabStream){ tabStream.getTracks().forEach(t=>t.stop()); }
    tabStream = stream;

    // ── MANTENER STREAM ACTIVO sin reproducir doble ──
    // El audio de la pestaña ya suena normalmente por los altavoces.
    // Usamos gain=0 para que el AudioContext mantenga el stream vivo
    // sin añadir una segunda copia del audio (evita el eco/doble sonido).
    const actx = new AudioContext();
    const tabSrc  = actx.createMediaStreamSource(stream);
    const silence = actx.createGain();
    silence.gain.value = 0;            // ← volumen 0: no suena doble
    tabSrc.connect(silence);
    silence.connect(actx.destination); // mantiene el stream activo en el contexto

    stream.getVideoTracks().forEach(t=>t.stop());
    stream.oninactive = () => { if(isRunning) stopAll(); };

    clearAll();
    esLocaleIdx = 0;
    retryDelay  = 400;
    const sl = getEffectiveLang(preferredRecLang);
    updateLangUI(sl);
    if(fresh) setActive('tab');
    else { modeLabel.textContent='TAB'; sourceTag.textContent='— AUDIO DEL SISTEMA —'; }
    startRec(sl);
    showNotif('✓ AUDIO ACTIVO — CAPTIONS + TRADUCCIÓN EN VIVO', 4000);
  } catch(err){
    if(err.name !== 'NotAllowedError') showNotif('ERROR: ' + err.message, 5000);
    else showNotif('CAPTURA CANCELADA');
  }
}

// ── Botones ──
btnMic.addEventListener('click', () => {
  if(!SR){ showNotif('USA CHROME O EDGE'); return; }
  keepMicAlive();
  clearAll();
  esLocaleIdx = 0;

  const sl = getEffectiveLang(preferredRecLang);
  retryDelay = 400;
  updateLangUI(sl);
  setActive('mic');
  startRec(sl);

  const msg = langMode === 'es' ? 'MODO ESPAÑOL — es-US ACTIVADO' :
              'ENGLISH MODE — en-US ACTIVE';
  showNotif(msg);
});

btnTab.addEventListener('click',     () => startTabCapture(true));
tabLiveBtn.addEventListener('click', () => startTabCapture(false));
stopBtn.addEventListener('click', stopAll);

muteBtn.addEventListener('click', () => {
  if(!isRunning) return;
  isMuted = !isMuted;
  if(isMuted){
    // MUTE: solo levantamos el flag. El recognition sigue vivo en segundo plano
    // pero onresult lo ignora. El micStream físico NO se toca — el permiso
    // del micrófono permanece activo en esta página.
    muteBtn.classList.add('muted'); muteLbl.textContent = 'ACTIVAR';
    micDot.classList.add('pause');
    showNotif('MIC MUTEADO — SOLO ESTA PÁGINA');
  } else {
    // DESMUTE: bajamos el flag y reiniciamos el recognition para que escuche
    // de nuevo. El micStream ya estaba vivo, no se pide permiso nuevo.
    muteBtn.classList.remove('muted'); muteLbl.textContent = 'MUTEAR';
    micDot.classList.remove('pause');
    startRec(getEffectiveLang(preferredRecLang));
    showNotif('MICRÓFONO ACTIVO');
  }
});

clearBtn.addEventListener('click', () => clearAll());

// ── Atajos de teclado ──
// CTRL = cambiar idioma ES ↔ EN
// ALT  = mutear/desmutear micrófono solo en esta página
// TAB  = abrir / cerrar libreta de notas
document.addEventListener('keydown', (e) => {
  if(e.target.tagName === 'INPUT') return;
  if(e.target.tagName === 'TEXTAREA' && e.key !== 'Tab') return;

  // TAB: toggle libreta de notas
  if(e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey){
    e.preventDefault();
    const overlay = document.getElementById('notepadOverlay');
    if(overlay && overlay.classList.contains('open')){
      overlay.classList.remove('open');
    } else if(overlay){
      overlay.classList.add('open');
      accPanel.classList.remove('open');
      accToggle.classList.remove('open');
      setTimeout(() => document.getElementById('notepadTextarea')?.focus(), 320);
    }
    return;
  }

  if(e.target.tagName === 'TEXTAREA') return;

  // CTRL: toggle idioma ES ↔ EN
  if(e.key === 'Control' && !e.altKey && !e.shiftKey && !e.metaKey){
    e.preventDefault();
    const next = langMode === 'es' ? 'en' : 'es';
    setLangMode(next);
    return;
  }

  // ALT: mutear/desmutear MIC solo en esta página (no afecta otras pestañas)
  if(e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey){
    e.preventDefault();
    if(isRunning) muteBtn.click();
    return;
  }
});

// ── ACCESSIBILITY MENU ──
const accToggle     = document.getElementById('accToggle');
const accPanel      = document.getElementById('accPanel');
const fontSizeSlider= document.getElementById('fontSizeSlider');
const fontSizeHint  = document.getElementById('fontSizeHint');
const speedSlider   = document.getElementById('speedSlider');
const speedHint     = document.getElementById('speedHint');
const silenceSlider = document.getElementById('silenceSlider');
const silenceHint   = document.getElementById('silenceHint');
// Toggle panel
accToggle.addEventListener('click', () => {
  const open = accPanel.classList.toggle('open');
  accToggle.classList.toggle('open', open);
});
document.addEventListener('click', (e) => {
  if(!e.target.closest('#accMenuWrap')){
    accPanel.classList.remove('open');
    accToggle.classList.remove('open');
  }
});

// ── Tamaño de subtítulos ──
const FONT_LABELS = ['XS','S','NORMAL','L','XL'];
const FONT_SCALES = [0.55, 0.72, 1, 1.32, 1.65];
fontSizeSlider.addEventListener('input', () => {
  const idx = parseInt(fontSizeSlider.value) - 1;
  fontSizeHint.textContent = FONT_LABELS[idx];
  const scale = FONT_SCALES[idx];
  document.querySelectorAll('.para-left').forEach(el => {
    el.style.fontSize = `clamp(${Math.round(26*scale)}px,${(4.5*scale).toFixed(1)}vw,${Math.round(60*scale)}px)`;
  });
  document.querySelectorAll('.para-right').forEach(el => {
    el.style.fontSize = `clamp(${Math.round(17*scale)}px,${(2.9*scale).toFixed(1)}vw,${Math.round(42*scale)}px)`;
  });
});

// ── Velocidad de actualización (silence debounce) ──
const SPEED_LABELS  = ['LENTO (2.5s)','NORMAL (1.7s)','RÁPIDO (900ms)'];
const SPEED_VALUES  = [2500, 1700, 900];
speedSlider.addEventListener('input', () => {
  const idx = parseInt(speedSlider.value) - 1;
  speedHint.textContent = SPEED_LABELS[idx];
  // Override global SILENCE_MS via closure trick
  window._silenceOverride = SPEED_VALUES[idx];
});
// Patch silenceTimer to use override if set
const _origSilenceMS = 1700;
function getSilenceMS(){ return window._silenceOverride || _origSilenceMS; }

// ── Sensibilidad al silencio (switch cooldown) ──
const SILENCE_LABELS = ['ALTA — 500ms','BALANCEADO — 700ms','BAJA — 1100ms'];
const SILENCE_VALUES = [500, 850, 1100];
silenceSlider.addEventListener('input', () => {
  const idx = parseInt(silenceSlider.value) - 1;
  silenceHint.textContent = SILENCE_LABELS[idx];
  window._switchCooldown = SILENCE_VALUES[idx];
});

// ── RESTART: nueva sesión desde el estado pausado ──
restartBtn.addEventListener('click', () => {
  restartBtn.classList.remove('show');
  captionArea.classList.remove('show');
  langBadge.classList.remove('show');
  modeSelector.classList.remove('hide');
  sourceTag.textContent = ''; modeLabel.textContent = '\u2014';
});

// Inicializar lang mode UI sin sesión activa
setLangMode('es', true);

// ── NOTEPAD ──
const notepadOverlay  = document.getElementById('notepadOverlay');
const notepadClose    = document.getElementById('notepadClose');
const notepadTextarea = document.getElementById('notepadTextarea');
const notepadSaveBtn  = document.getElementById('notepadSaveBtn');
const notepadClearAllBtn= document.getElementById('notepadClearAllBtn');
const notepadSavedList  = document.getElementById('notepadSavedList');
const notepadEmpty      = document.getElementById('notepadEmpty');
const notesOpenBtn      = document.getElementById('notesOpenBtn');
const notesCountBadge   = document.getElementById('notesCountBadge');

let savedNotes = []; // {id, ts, text}

function openNotepad(){
  accPanel.classList.remove('open');
  accToggle.classList.remove('open');
  notepadOverlay.classList.add('open');
  setTimeout(() => notepadTextarea.focus(), 320);
}
function closeNotepad(){
  notepadOverlay.classList.remove('open');
}

notesOpenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openNotepad();
});
notepadClose.addEventListener('click', closeNotepad);
notepadOverlay.addEventListener('click', (e) => {
  if(e.target === notepadOverlay) closeNotepad();
});

function updateNotesBadge(){
  const n = savedNotes.length;
  notesCountBadge.textContent = n;
  notesCountBadge.classList.toggle('show', n > 0);
}

function renderSavedNotes(){
  // Remove all saved entries (keep empty msg)
  notepadSavedList.querySelectorAll('.notepad-saved-entry').forEach(el => el.remove());
  notepadEmpty.style.display = savedNotes.length === 0 ? 'block' : 'none';
  savedNotes.slice().reverse().forEach(note => {
    const entry = document.createElement('div');
    entry.className = 'notepad-saved-entry';
    entry.id = 'note-' + note.id;

    const ts = document.createElement('div');
    ts.className = 'notepad-saved-ts';
    ts.textContent = note.ts;

    const txt = document.createElement('div');
    txt.className = 'notepad-saved-text';
    txt.textContent = note.text;

    const del = document.createElement('button');
    del.className = 'notepad-del-btn';
    del.textContent = '✕';
    del.title = 'Eliminar nota';
    del.addEventListener('click', () => {
      savedNotes = savedNotes.filter(n => n.id !== note.id);
      renderSavedNotes();
      updateNotesBadge();
    });

    entry.appendChild(ts);
    entry.appendChild(txt);
    entry.appendChild(del);
    notepadSavedList.appendChild(entry);
    // Aplicar tamaño de letra actual si ya está definido
    if(typeof noteFontIdx !== 'undefined' && typeof FONT_SIZES !== 'undefined'){
      txt.style.fontSize = FONT_SIZES[noteFontIdx] + 'px';
    }
  });
}

function saveCurrentNote(){
  const text = notepadTextarea.value.trim();
  if(!text){ notepadTextarea.focus(); return; }
  const now = new Date();
  const ts  = now.toLocaleTimeString('es-DO', {hour:'2-digit', minute:'2-digit', second:'2-digit'})
             + ' · ' + now.toLocaleDateString('es-DO', {day:'2-digit', month:'short'});
  savedNotes.push({ id: Date.now(), ts, text });
  notepadTextarea.value = '';
  renderSavedNotes();
  updateNotesBadge();
  showNotif('NOTA GUARDADA ✓', 2200);
}

notepadSaveBtn.addEventListener('click', saveCurrentNote);

notepadClearAllBtn.addEventListener('click', () => {
  if(savedNotes.length === 0 && !notepadTextarea.value.trim()){ return; }
  savedNotes = [];
  notepadTextarea.value = '';
  renderSavedNotes();
  updateNotesBadge();
  showNotif('NOTAS BORRADAS', 2000);
});

// Ctrl+Enter en textarea = guardar nota
notepadTextarea.addEventListener('keydown', (e) => {
  if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
    e.preventDefault();
    saveCurrentNote();
  }
});

// Init render
renderSavedNotes();
updateNotesBadge();

// ── CONTROL TAMAÑO LETRA NOTAS ──
const notepadFontInc   = document.getElementById('notepadFontInc');
const notepadFontDec   = document.getElementById('notepadFontDec');
const notepadFontLabel = document.getElementById('notepadFontLabel');
const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24];
let noteFontIdx = 2; // default = 11px

function applyNoteFont(){
  const sz = FONT_SIZES[noteFontIdx];
  notepadTextarea.style.fontSize = sz + 'px';
  notepadFontLabel.textContent   = sz + 'px';
  // Aplicar también a las notas guardadas
  document.querySelectorAll('.notepad-saved-text').forEach(el => el.style.fontSize = sz + 'px');
}

notepadFontInc.addEventListener('click', () => {
  if(noteFontIdx < FONT_SIZES.length - 1){ noteFontIdx++; applyNoteFont(); }
});
notepadFontDec.addEventListener('click', () => {
  if(noteFontIdx > 0){ noteFontIdx--; applyNoteFont(); }
});

// Aplicar tamaño guardado al crear nuevas notas (parche en renderSavedNotes)
const _origRender = renderSavedNotes;
// Override para que las notas nuevas hereden el tamaño actual
const _renderSavedNotesPatch = () => {
  _origRender();
  const sz = FONT_SIZES[noteFontIdx];
  document.querySelectorAll('.notepad-saved-text').forEach(el => el.style.fontSize = sz + 'px');
};
// Patch global
window.renderSavedNotesSized = _renderSavedNotesPatch;