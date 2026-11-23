import { CoordinatePicker } from '../../components/host/CoordinatePicker';
import { useAuth } from '../../context/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fieldErrors, propertyWriteErrorMessage, useCreateProperty, useRequestVerification, useUploadPropertyPhoto,
} from '../../api/properties';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { FormField, fieldClass } from '../../components/host/FormField';
import { PhotoPicker, type PhotoStatus } from '../../components/host/PhotoPicker';
import { RoomsEditor } from '../../components/host/RoomsEditor';
import {
  emptyPropertyForm, formKeyFromApiField, toPropertyCreate, validatePropertyForm,
  type FormErrors, type PhotoDraft, type PropertyFormState,
  applyMapAddress,
} from '../../components/host/propertyForm';
import {
  CATALOG_LIMITS, FEATURE_CATALOG, PROPERTY_TYPE_LABELS, PROPERTY_TYPES, type Property,
} from '../../types/catalog';

type Intent = 'publish' | 'draft';
type Phase = 'idle' | 'creating' | 'uploading' | 'publishing';

const PHASE_LABEL: Record<Phase, string> = {
  idle: '', creating: 'Creando la propiedad…', uploading: 'Subiendo fotos…', publishing: 'Enviando a revisión…',
};

/**
 * RQ-05: an owner creates a property (DRAFT), uploads its photos and, optionally, publishes it.
 * The steps are resumable: after a partial failure only the missing steps run again, so retrying
 * never creates a duplicate property.
 */
export function PublishProperty() {
  const navigate = useNavigate();
  const createMutation = useCreateProperty();
  const uploadMutation = useUploadPropertyPhoto();
  const publishMutation = useRequestVerification();

  const [form, setForm] = useState<PropertyFormState>(emptyPropertyForm);
  const draftKey='stayhub:property-draft:'+useAuth().currentUser?.id;
  const [stored,setStored]=useState<{form:PropertyFormState;at:string}>();
  const [step,setStep]=useState<number | null>(null);
  const [previewPhoto,setPreviewPhoto]=useState('');
  const [savedAt,setSavedAt]=useState('');
  useEffect(()=>{try{const raw=localStorage.getItem(draftKey);if(raw){const value=JSON.parse(raw);if(typeof value.form?.name==='string' && Array.isArray(value.form.rooms))setStored(value);}}catch{/* storage unavailable */}},[draftKey]);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<Record<string, PhotoStatus>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Property>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [general, setGeneral] = useState<string>();
  const submitting = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{const first=photos[0];if(!first || typeof URL.createObjectURL!=='function'){setPreviewPhoto('');return;}const url=URL.createObjectURL(first.file);setPreviewPhoto(url);return ()=>URL.revokeObjectURL(url);},[photos]);
  const persisted = useRef(false);
  useEffect(()=>{
    if(stored || persisted.current || ![form.name,form.addressLine,form.city,form.description,...form.rooms.map(r=>r.name)].some(Boolean))return;
    const at=new Date().toISOString();
    try {localStorage.setItem(draftKey,JSON.stringify({at,form}));setSavedAt(at);}catch{/* browser storage may be unavailable */}
  },[draftKey,form,stored]);
  const busy = phase !== 'idle';

  const set = (key: keyof PropertyFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = key === 'country' ? e.target.value.toUpperCase() : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((p) => { const next = { ...p }; delete next[key]; delete next[`location.${key}`]; return next; });
  };
  const toggleFeature = (code: string) => setForm((f) => ({
    ...f, featureCodes: f.featureCodes.includes(code) ? f.featureCodes.filter((c) => c !== code) : [...f.featureCodes, code],
  }));

  const fail = (message: string, found: FormErrors = {}) => {
    setStep(null);
    setGeneral(message);
    setErrors((p) => ({ ...p, ...found }));
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const submit = async (intent: Intent) => {
    if (submitting.current) return;
    const found = validatePropertyForm(form, photos, { publish: intent === 'publish' });
    setErrors(found);
    if (Object.keys(found).length) { fail('Revisa los campos marcados antes de continuar.'); return; }
    setGeneral(undefined);
    submitting.current = true;
    try {
      // 1. Create once.
      let property = created;
      if (!property) {
        setPhase('creating');
        try {
          property = await createMutation.mutateAsync(toPropertyCreate(form));
          persisted.current=true; try{localStorage.removeItem(draftKey);}catch{/* optional storage */}
          setCreated(property);
        } catch (error) {
          const mapped = Object.fromEntries(fieldErrors(error).map((f) => [formKeyFromApiField(f), 'Valor no válido.']));
          fail(propertyWriteErrorMessage(error), mapped);
          return;
        }
      }

      // 2. Upload photos that are not stored yet, in order (position follows upload order).
      setPhase('uploading');
      let failures = 0;
      for (const photo of photos) {
        if (status[photo.key] === 'uploaded') continue;
        setStatus((s) => ({ ...s, [photo.key]: 'uploading' }));
        try {
          await uploadMutation.mutateAsync({ propertyId: property.id, file: photo.file });
          setStatus((s) => ({ ...s, [photo.key]: 'uploaded' }));
          setUploadErrors((u) => { const next = { ...u }; delete next[photo.key]; return next; });
        } catch (error) {
          failures += 1;
          setStatus((s) => ({ ...s, [photo.key]: 'failed' }));
          setUploadErrors((u) => ({ ...u, [photo.key]: propertyWriteErrorMessage(error) }));
        }
      }
      if (failures > 0) {
        fail(`La propiedad se guardó como borrador, pero ${failures === 1 ? 'una foto no se pudo subir' : `${failures} fotos no se pudieron subir`}. Corrige o quita las fotos marcadas y vuelve a intentarlo.`);
        return;
      }

      // 3. Publish when requested.
      if (intent === 'publish' && property.status !== 'PUBLISHED') {
        setPhase('publishing');
        try {
          property = await publishMutation.mutateAsync(property);
          persisted.current=true; try{localStorage.removeItem(draftKey);}catch{/* optional storage */}
          setCreated(property);
        } catch (error) {
          fail(`La propiedad se guardó como borrador, pero no se pudo solicitar la revisión. ${propertyWriteErrorMessage(error)}`);
          return;
        }
      }
      navigate(paths.property(property.id), { replace: true });
    } finally {
      submitting.current = false;
      setPhase('idle');
    }
  };

  const locked = busy || !!created;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="management-content flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
        <p className="text-sm text-primary font-semibold mb-1">Panel de anfitrión</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Publicar propiedad</h1>
        <p className="text-sm text-gray-500 mb-8">Completa los datos, agrega habitaciones con su precio y sube al menos una foto para solicitar la revisión.</p>

        {stored && <section className="surface"><p>Borrador del {new Date(stored.at).toLocaleString('es-CO')}. Vuelve a seleccionar las fotos.</p><button className="action-primary" onClick={()=>{setForm({...stored.form,rooms:stored.form.rooms.map(room=>({...room,key:crypto.randomUUID()}))});setStored(undefined);}}>Continuar borrador</button> <button onClick={()=>{localStorage.removeItem(draftKey);setStored(undefined);}}>Descartar borrador</button></section>}
        {savedAt && !created && <p>Guardado en este navegador a las {new Date(savedAt).toLocaleTimeString('es-CO')}</p>}
        <nav className="flex gap-3 flex-wrap" aria-label="Pasos de publicación">{['Ubicación','Habitaciones y tarifas','Fotos','Revisión'].map((name,index)=><button type="button" className="manage-link" aria-pressed={step===index} onClick={()=>setStep(index)} key={name}>{index+1}. {name}</button>)}{step!==null && <button type="button" onClick={()=>setStep(null)}>Mostrar todo</button>}</nav>
        <form
          noValidate
          aria-busy={busy}
          onSubmit={(e) => { e.preventDefault(); if(step!==null && step<3)setStep(step+1);else void submit('publish'); }}
          className="flex flex-col gap-10"
        >
          {general && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl focus:outline-none">
              {general}
            </div>
          )}
          {created && (
            <p role="status" className="bg-gray-50 border border-gray-200 text-gray-700 text-sm px-4 py-3 rounded-xl">
              Los datos de la propiedad ya se guardaron. Solo faltan los pasos pendientes.
            </p>
          )}

          <fieldset hidden={step!==null && step!==0} disabled={locked} className="flex flex-col gap-4">
            <legend className="text-lg font-bold text-gray-900 mb-2">Datos generales</legend>
            <FormField id="property-type" label="Tipo de alojamiento" error={errors.type}>
              <select value={form.type} onChange={set('type')} className={fieldClass(!!errors.type)}>
                <option value="">Selecciona una opción</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}
              </select>
            </FormField>
            <FormField id="property-name" label="Nombre" error={errors.name}>
              <input value={form.name} maxLength={CATALOG_LIMITS.nameMaxLength} onChange={set('name')} placeholder="Casa frente al mar" className={fieldClass(!!errors.name)} />
            </FormField>
            <FormField id="property-description" label="Descripción" error={errors.description} hint={`${form.description.length}/${CATALOG_LIMITS.descriptionMaxLength} caracteres`}>
              <textarea rows={5} value={form.description} maxLength={CATALOG_LIMITS.descriptionMaxLength} onChange={set('description')} className={fieldClass(!!errors.description)} />
            </FormField>
          </fieldset>

          <fieldset hidden={step!==null && step!==0} disabled={locked} className="flex flex-col gap-4">
            <legend className="text-lg font-bold text-gray-900 mb-2" id="ubicacion">Ubicación</legend>
            <FormField id="property-address" label="Dirección" error={errors['location.addressLine']}>
              <input value={form.addressLine} maxLength={CATALOG_LIMITS.addressLineMaxLength} onChange={set('addressLine')} className={fieldClass(!!errors['location.addressLine'])} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="property-city" label="Ciudad" error={errors['location.city']}>
                <input value={form.city} maxLength={CATALOG_LIMITS.cityMaxLength} onChange={set('city')} className={fieldClass(!!errors['location.city'])} />
              </FormField>
              <FormField id="property-region" label="Región o estado" error={errors['location.region']}>
                <input value={form.region} maxLength={CATALOG_LIMITS.regionMaxLength} onChange={set('region')} className={fieldClass(!!errors['location.region'])} />
              </FormField>
              <FormField id="property-country" label="País (código ISO de 2 letras)" error={errors['location.country']}>
                <input value={form.country} maxLength={2} onChange={set('country')} placeholder="CO" autoComplete="country" className={fieldClass(!!errors['location.country'])} />
              </FormField>
              <FormField id="property-postal" label="Código postal (opcional)" error={errors['location.postalCode']}>
                <input value={form.postalCode} maxLength={CATALOG_LIMITS.postalCodeMaxLength} onChange={set('postalCode')} className={fieldClass(!!errors['location.postalCode'])} />
              </FormField>
              <FormField id="property-latitude" label="Latitud (opcional)" error={errors['location.latitude']}>
                <input inputMode="decimal" value={form.latitude} onChange={set('latitude')} placeholder="4.7110" className={fieldClass(!!errors['location.latitude'])} />
              </FormField>
              <FormField id="property-longitude" label="Longitud (opcional)" error={errors['location.longitude']}>
                <input inputMode="decimal" value={form.longitude} onChange={set('longitude')} placeholder="-74.0721" className={fieldClass(!!errors['location.longitude'])} />
              </FormField>
            </div>
            <CoordinatePicker latitude={form.latitude} longitude={form.longitude} disabled={locked}
              onSelect={(latitude, longitude) => {
                setForm(current => current && ({ ...current, latitude, longitude }));
                setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'location.latitude' && key !== 'location.longitude')));
              }}
              onAddress={(latitude, longitude, address) => {
                setForm(current => current && applyMapAddress(current, form, latitude, longitude, address));
                setErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) =>
                  !Object.entries(address).some(([field, value]) => value && key === `location.${field}`))));
              }} />
          </fieldset>

          <fieldset hidden={step!==null && step!==1} disabled={locked} className="flex flex-col gap-3">
            <legend className="text-lg font-bold text-gray-900 mb-2">Características</legend>
            <div className="grid grid-cols-2 gap-3">
              {FEATURE_CATALOG.map((f) => (
                <label key={f.code} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.featureCodes.includes(f.code)} onChange={() => toggleFeature(f.code)} className="accent-primary" />
                  {f.name}
                </label>
              ))}
            </div>
            {errors.featureCodes && <p role="alert" className="text-xs text-red-600">{errors.featureCodes}</p>}
          </fieldset>

          <section hidden={step!==null && step!==1}><RoomsEditor
            rooms={form.rooms}
            errors={errors}
            disabled={locked}
            onChange={(rooms) => { setForm((f) => ({ ...f, rooms })); setErrors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('rooms')))); }}
          />

          </section><section hidden={step!==null && step!==2}><PhotoPicker
            photos={photos}
            errors={errors}
            status={status}
            uploadErrors={uploadErrors}
            disabled={busy}
            onChange={(next) => {
              setPhotos(next);
              setErrors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('photos'))));
            }}
          />

          </section><section hidden={step!==null && step!==3} id="revision" className="surface"><h2>Vista previa del alojamiento</h2><strong>{form.name}</strong>{previewPhoto && <img className="mt-3 max-h-64 rounded-xl object-cover" src={previewPhoto} alt="Vista previa de la portada" />}<p>{[form.city,form.country].filter(Boolean).join(', ')}</p><p>{form.description}</p>{form.rooms.map(r=><p key={r.key}>{r.name} · {r.capacity} huéspedes · {r.amount} {r.currency} / noche · {form.featureCodes.includes('BREAKFAST_INCLUDED')?'Desayuno incluido':r.breakfastAmount ? 'Desayuno: '+r.breakfastAmount+' '+r.currency : 'Sin desayuno opcional'}</p>)}{photos[0] && <p>Portada: {photos[0].file.name}</p>}</section>
          <div className="flex flex-wrap items-center gap-3">
             {step!==null && step<3 ? <button type="button" className="action-primary" onClick={()=>setStep(step+1)}>Siguiente</button> : <Button type="submit" variant="primary" size="lg" loading={busy}>Solicitar revisión</Button>}
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => { void submit('draft'); }}>
              Guardar como borrador
            </Button>
            {busy && <p role="status" className="text-sm text-gray-500">{PHASE_LABEL[phase]}</p>}
          </div>
        </form>
      </main>
    </div>
  );
}
