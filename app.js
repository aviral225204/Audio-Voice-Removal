// app.js - Audio denoise web logic
const fileInput = document.getElementById('file');
const playOriginalBtn = document.getElementById('playOriginal');
const stopBtn = document.getElementById('stop');
const cutoff = document.getElementById('cutoff');
const cutoffLabel = document.getElementById('cutoffLabel');
const qInput = document.getElementById('q');
const processBtn = document.getElementById('process');
const downloadLink = document.getElementById('downloadLink');
const playProcessedBtn = document.getElementById('playProcessed');
const origCanvas = document.getElementById('origWave');
const procCanvas = document.getElementById('procWave');
const deleteBtn = document.getElementById('deleteAll');

let audioCtx = null;
let origBuffer = null;
let processedBuffer = null;
let sourceNode = null;

function drawWave(canvas, buffer) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.clientWidth * devicePixelRatio;
  const height = canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle = '#071028';
  ctx.fillRect(0,0,width,height);
  if(!buffer) return;
  const data = buffer.getChannelData(0);
  ctx.lineWidth = 1 * devicePixelRatio;
  ctx.strokeStyle = '#3fb';
  ctx.beginPath();
  const step = Math.max(1, Math.floor(data.length / width));
  const amp = height/2;
  for(let i=0;i<width;i++){
    const idx = Math.min(data.length-1, i*step);
    const sample = data[idx];
    const y = (1 - sample) * (amp);
    if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y);
  }
  ctx.stroke();
}

async function decodeFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  origBuffer = await decodeFile(file);
  processedBuffer = null;
  playOriginalBtn.disabled = false;
  processBtn.disabled = false;
  playProcessedBtn.disabled = true;
  downloadLink.style.display = 'none';
  drawWave(origCanvas, origBuffer);
});

playOriginalBtn.addEventListener('click', ()=>{
  if(!origBuffer) return;
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  stop();
  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = origBuffer;
  sourceNode.connect(audioCtx.destination);
  sourceNode.start();
  stopBtn.disabled = false;
});

stopBtn.addEventListener('click', ()=>{ stop(); });
function stop(){
  try{ if(sourceNode){ sourceNode.stop(); sourceNode.disconnect(); } }catch(e){}
  sourceNode = null;
  stopBtn.disabled = true;
}

cutoff.addEventListener('input', ()=>{ cutoffLabel.textContent = cutoff.value; });

processBtn.addEventListener('click', async ()=>{
  if(!origBuffer) return;
  processBtn.disabled = true;
  processBtn.textContent = 'Processing...';
  
  const fs = origBuffer.sampleRate;
  const offline = new OfflineAudioContext(origBuffer.numberOfChannels, origBuffer.length, fs);
  const src = offline.createBufferSource();
  src.buffer = origBuffer;

  const filter = offline.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Number(cutoff.value);
  filter.Q.value = Number(qInput.value) || 1;

  src.connect(filter);
  filter.connect(offline.destination);
  src.start();

  try{
    const rendered = await offline.startRendering();
    processedBuffer = rendered;
    drawWave(procCanvas, processedBuffer);

    const wav = audioBufferToWav(processedBuffer);
    const blob = new Blob([wav], {type: 'audio/wav'});
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = 'processed.wav';
    downloadLink.textContent = 'Download processed.wav';
    downloadLink.style.display = 'inline-block';
    playProcessedBtn.disabled = false;

  }catch(err){
    alert('Processing failed: '+err.message);
  }

  processBtn.disabled = false;
  processBtn.textContent = 'Process & Download';
});

playProcessedBtn.addEventListener('click', ()=>{
  if(!processedBuffer) return;
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  stop();
  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = processedBuffer;
  sourceNode.connect(audioCtx.destination);
  sourceNode.start();
  stopBtn.disabled = false;
});

// ===============================
// DELETE / RESET FUNCTIONALITY
// ===============================
deleteBtn.addEventListener('click', () => {
    stop(); // stop any playing audio

    origBuffer = null;
    processedBuffer = null;

    fileInput.value = "";  // clear uploaded file

    playOriginalBtn.disabled = true;
    processBtn.disabled = true;
    playProcessedBtn.disabled = true;
    stopBtn.disabled = true;
    downloadLink.style.display = "none";

    clearCanvas(origCanvas);
    clearCanvas(procCanvas);

    alert("Audio removed successfully!");
});

// Clear canvas function
function clearCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#071028";
    ctx.fillRect(0,0,canvas.width,canvas.height);
}

// ===============================
// WAV ENCODER
// ===============================
function audioBufferToWav(buffer) {
  var numChannels = buffer.numberOfChannels;
  var sampleRate = buffer.sampleRate;
  var bitDepth = 16;
  var samples = buffer.getChannelData(0);
  return encodeWAV(samples, numChannels, sampleRate, bitDepth);
}

function writeString(view, offset, string){
  for (var i = 0; i < string.length; i++){
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output, offset, input){
  for (var i = 0; i < input.length; i++, offset += 2){
    var s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function encodeWAV(samples, numChannels, sampleRate, bitDepth){
  var bytesPerSample = bitDepth / 8;
  var blockAlign = numChannels * bytesPerSample;
  var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  var view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  floatTo16BitPCM(view, 44, samples);
  return view;
}

// Resize canvases for crisp drawing
function resizeCanvas(canvas){
  const dpr = devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
}
[origCanvas, procCanvas].forEach(resizeCanvas);

// Spacebar shortcut to toggle playback
window.addEventListener('keydown', (e)=>{
  if(e.code === 'Space'){
    e.preventDefault();
    if(sourceNode) stop(); else playOriginalBtn.click();
  }
});
