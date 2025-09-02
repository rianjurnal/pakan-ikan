// MQTT Configuration
const MQTT_CONFIG = {
    broker: 'wss://broker.hivemq.com:8884/mqtt',
    topics: {
        feed: 'aquafeeder_5ff4a2ce/feed',
        schedule_morning: 'aquafeeder_5ff4a2ce/schedule/morning',
        schedule_evening: 'aquafeeder_5ff4a2ce/schedule/evening',
        schedule_night: 'aquafeeder_5ff4a2ce/schedule/night',
        status: 'aquafeeder_5ff4a2ce/status',
        food_available: 'aquafeeder_5ff4a2ce/food_available',
        water_level: 'aquafeeder_5ff4a2ce/water_level',
        turbidity: 'aquafeeder_5ff4a2ce/turbidity',
        temperature: 'aquafeeder_5ff4a2ce/temperature',
        feed_status: 'aquafeeder_5ff4a2ce/feed_status',  // Added
        alerts: 'aquafeeder_5ff4a2ce/alerts'             // Added
    }
};

// Global variables
let mqttClient = null;
let isFoodAvailable = true;
let currentWaterLevel = 50;
let currentTurbidity = 0.0;
let currentTemperature = 27.0;
let selectedSchedule = ['09:00', '15:00', '20:00'];

// DOM elements
const feedButton = document.getElementById('feedButton');
const saveScheduleButton = document.getElementById('saveScheduleButton');
const foodStatus = document.getElementById('foodStatus');
const foodStatusText = document.getElementById('foodStatusText');
const waterLevelValue = document.getElementById('waterLevelValue');
const waterLevelStatus = document.getElementById('waterLevelStatus');
const waterLevelGauge = document.getElementById('waterLevelGauge');
const turbidityValue = document.getElementById('turbidityValue');
const turbidityStatus = document.getElementById('turbidityStatus');
const turbidityGauge = document.getElementById('turbidityGauge');
const temperatureValue = document.getElementById('temperatureValue');
const temperatureStatus = document.getElementById('temperatureStatus');
const temperatureGauge = document.getElementById('temperatureGauge');
const mqttStatus = document.getElementById('mqttStatus');
const alertContainer = document.getElementById('alertContainer');

// Function to draw gauge with dark theme
function drawGauge(canvas, value, maxValue, color) {
    const ctx = canvas.getContext('2d');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 6;
    const lineWidth = 6;
    const startAngle = -Math.PI / 2;
    const percentage = Math.min(value / maxValue, 1);
    const endAngle = startAngle + percentage * 2 * Math.PI;

    ctx.clearRect(0, 0, size, size);

    // Draw background arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.stroke();

    // Draw value arc with gradient effect
    const gradient = ctx.createConicGradient(startAngle, centerX, centerY);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + '80');

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// Enhanced alert function with auto-dismiss and different types
function showAlert(message, type = 'error', duration = 5000) {
    const alertClass = type === 'error' ? 'alert-error' : 
                     type === 'warning' ? 'alert-warning' :
                     type === 'info' ? 'alert-info' : 'alert-success';
    const iconClass = type === 'error' ? 'fa-exclamation-circle' : 
                     type === 'warning' ? 'fa-exclamation-triangle' :
                     type === 'info' ? 'fa-info-circle' : 'fa-check-circle';

    // Create alert element
    const alertId = 'alert_' + Date.now();
    const alertHTML = `
        <div id="${alertId}" class="${alertClass} p-4 rounded-lg text-sm font-medium mb-2 animate-pulse">
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <i class="fas ${iconClass} mr-2"></i>
                    ${message}
                </div>
                <button onclick="dismissAlert('${alertId}')" class="ml-2 text-sm opacity-70 hover:opacity-100">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;

    // Add to container
    alertContainer.insertAdjacentHTML('beforeend', alertHTML);

    // Auto-dismiss after specified duration
    if (duration > 0) {
        setTimeout(() => {
            dismissAlert(alertId);
        }, duration);
    }

    // Log to console
    console.log(`Alert [${type.toUpperCase()}]: ${message}`);
}

// Function to dismiss alert
function dismissAlert(alertId) {
    const alertElement = document.getElementById(alertId);
    if (alertElement) {
        alertElement.style.transition = 'opacity 0.3s ease-out';
        alertElement.style.opacity = '0';
        setTimeout(() => {
            alertElement.remove();
        }, 300);
    }
}

// Update food status with dark theme
function updateFoodStatus(available) {
    isFoodAvailable = available;
    if (available) {
        foodStatus.className = 'boolean-status flex items-center gap-3 p-3 rounded-lg font-semibold text-sm status-good';
        foodStatus.innerHTML = '<i class="fas fa-check-circle"></i><span>Tersedia</span>';
    } else {
        foodStatus.className = 'boolean-status flex items-center gap-3 p-3 rounded-lg font-semibold text-sm status-danger';
        foodStatus.innerHTML = '<i class="fas fa-times-circle"></i><span>Kosong</span>';
    }
}

// Update water level display with dark theme
function updateWaterLevel(level) {
    currentWaterLevel = Math.max(0, level);
    waterLevelValue.textContent = currentWaterLevel.toFixed(0);
    const statusElement = waterLevelStatus;
    statusElement.className = 'status-indicator px-3 py-1 rounded-full text-xs font-semibold';
    let color;

    if (currentWaterLevel < 20) {
        statusElement.classList.add('status-danger');
        statusElement.textContent = 'Rendah';
        color = '#ef4444';
    } else if (currentWaterLevel < 40) {
        statusElement.classList.add('status-warning');
        statusElement.textContent = 'Sedang';
        color = '#f59e0b';
    } else if (currentWaterLevel < 70) {
        statusElement.classList.add('status-info');
        statusElement.textContent = 'Baik';
        color = '#3b82f6';
    } else {
        statusElement.classList.add('status-good');
        statusElement.textContent = 'Tinggi';
        color = '#14b8a6';
    }
    drawGauge(waterLevelGauge, currentWaterLevel, 100, color);
}

// Update turbidity display with dark theme
function updateTurbidity(value) {
    currentTurbidity = Math.max(0, value);
    turbidityValue.textContent = currentTurbidity.toFixed(1);
    const statusElement = turbidityStatus;
    statusElement.className = 'status-indicator px-3 py-1 rounded-full text-xs font-semibold';
    let color;

    if (currentTurbidity <= 1.0) {
        statusElement.classList.add('status-good');
        statusElement.textContent = 'Sangat Jernih';
        color = '#14b8a6';
    } else if (currentTurbidity <= 4.0) {
        statusElement.classList.add('status-info');
        statusElement.textContent = 'Jernih';
        color = '#3b82f6';
    } else if (currentTurbidity <= 10.0) {
        statusElement.classList.add('status-warning');
        statusElement.textContent = 'Agak Keruh';
        color = '#f59e0b';
    } else {
        statusElement.classList.add('status-danger');
        statusElement.textContent = 'Keruh';
        color = '#ef4444';
    }
    drawGauge(turbidityGauge, currentTurbidity, 20, color);
}

// Update temperature display with dark theme
function updateTemperature(value) {
    currentTemperature = Math.max(0, value);
    temperatureValue.textContent = currentTemperature.toFixed(1);
    const statusElement = temperatureStatus;
    statusElement.className = 'status-indicator px-3 py-1 rounded-full text-xs font-semibold';
    let color;

    if (currentTemperature < 25.0) {
        statusElement.classList.add('status-info');
        statusElement.textContent = 'Dingin';
        color = '#3b82f6';
    } else if (currentTemperature >= 25.0 && currentTemperature <= 30.0) {
        statusElement.classList.add('status-good');
        statusElement.textContent = 'Normal';
        color = '#14b8a6';
    } else {
        statusElement.classList.add('status-danger');
        statusElement.textContent = 'Panas';
        color = '#ef4444';
    }
    drawGauge(temperatureGauge, currentTemperature - 15, 20, color);
}

// Initialize MQTT connection
function initMQTT() {
    try {
        mqttClient = mqtt.connect(MQTT_CONFIG.broker, {
            will: {
                topic: MQTT_CONFIG.topics.status,
                payload: JSON.stringify({
                    device: 'fish_feeder',
                    status: 'offline',
                    timestamp: new Date().toISOString()
                }),
                qos: 0,
                retain: true
            }
        });

        mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');
            updateMQTTStatus(true);

            Object.values(MQTT_CONFIG.topics).forEach(topic => {
                mqttClient.subscribe(topic, { qos: 0 }, (err) => {
                    if (!err) {
                        console.log(`Subscribed to ${topic}`);
                    } else {
                        console.error(`Failed to subscribe to ${topic}:`, err);
                        showAlert(`Gagal berlangganan ke ${topic}!`, 'error');
                    }
                });
            });

            publishMessage(MQTT_CONFIG.topics.status, JSON.stringify({
                device: 'fish_feeder',
                status: 'online',
                timestamp: new Date().toISOString()
            }), { qos: 0, retain: true });

            showAlert('Berhasil terhubung ke MQTT broker!', 'success', 3000);
        });

        mqttClient.on('message', (topic, message) => {
            handleMQTTMessage(topic, message.toString());
        });

        mqttClient.on('error', (error) => {
            console.error('MQTT Error:', error);
            updateMQTTStatus(false);
            showAlert('Gagal terhubung ke MQTT broker!', 'error');
        });

        mqttClient.on('close', () => {
            console.log('MQTT connection closed');
            updateMQTTStatus(false);
            showAlert('Koneksi MQTT terputus!', 'warning');
        });

    } catch (error) {
        console.error('Failed to initialize MQTT:', error);
        updateMQTTStatus(false);
        showAlert('Gagal menginisialisasi MQTT!', 'error');
    }
}

// Handle MQTT messages
function handleMQTTMessage(topic, message) {
    try {
        console.log(`Received message on ${topic}: ${message}`);
        
        // Handle non-JSON messages first
        if (topic === MQTT_CONFIG.topics.feed && message === 'manual_feed') {
            console.log('Manual feed command received');
            return;
        }

        // Try to parse as JSON, but handle plain text fallback
        let data;
        try {
            data = JSON.parse(message);
        } catch (parseError) {
            // Handle non-JSON messages
            console.warn('Non-JSON message received:', message);
            data = { raw: message };
        }

        switch (topic) {
            case MQTT_CONFIG.topics.food_available:
                if (typeof data.available === 'boolean') {
                    updateFoodStatus(data.available);
                    console.log('Food status updated:', data.available ? 'Available' : 'Empty');
                }
                break;
            case MQTT_CONFIG.topics.water_level:
                if (typeof data.level === 'number') {
                    updateWaterLevel(data.level);
                    console.log('Water level updated:', data.level, 'cm');
                }
                break;
            case MQTT_CONFIG.topics.turbidity:
                if (typeof data.value === 'number') {
                    updateTurbidity(data.value);
                    console.log('Turbidity updated:', data.value, 'NTU');
                }
                break;
            case MQTT_CONFIG.topics.temperature:
                if (typeof data.value === 'number') {
                    updateTemperature(data.value);
                    console.log('Temperature updated:', data.value, '°C');
                }
                break;
            case MQTT_CONFIG.topics.schedule_morning:
                if (data.time && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.time)) {
                    selectedSchedule[0] = data.time;
                    updateScheduleUI();
                }
                break;
            case MQTT_CONFIG.topics.schedule_evening:
                if (data.time && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.time)) {
                    selectedSchedule[1] = data.time;
                    updateScheduleUI();
                }
                break;
            case MQTT_CONFIG.topics.schedule_night:
                if (data.time && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.time)) {
                    selectedSchedule[2] = data.time;
                    updateScheduleUI();
                }
                break;
            case MQTT_CONFIG.topics.feed_status:
                // Handle feeding status updates
                if (data.type && data.status) {
                    const feedType = data.type === 'manual' ? 'Manual' : 'Terjadwal';
                    const feedTime = data.time || 'Unknown';
                    if (data.status === 'success') {
                        showAlert(`${feedType} feeding berhasil pada ${feedTime}`, 'success', 4000);
                    } else {
                        showAlert(`${feedType} feeding gagal pada ${feedTime}`, 'error', 4000);
                    }
                }
                break;
            case MQTT_CONFIG.topics.alerts:
                // Handle alert messages from Arduino
                if (data.message) {
                    const alertType = data.type === 'alert' ? 'warning' : 'info';
                    const alertTime = data.time || new Date().toLocaleTimeString().substring(0, 5);
                    showAlert(`[${alertTime}] ${data.message}`, alertType, 8000);
                }
                break;
            case MQTT_CONFIG.topics.status:
                console.log('Device status:', data);
                if (data.device === 'fish_feeder') {
                    if (data.status === 'online') {
                        showAlert('Arduino feeder online!', 'info', 3000);
                    } else if (data.status === 'offline') {
                        showAlert('Arduino feeder offline!', 'warning', 5000);
                    }
                }
                break;
        }
    } catch (error) {
        console.error('Error parsing MQTT message:', error, 'Topic:', topic, 'Message:', message);
    }
}

// Publish MQTT message
function publishMessage(topic, data, options = {}) {
    if (mqttClient && mqttClient.connected) {
        mqttClient.publish(topic, data, options);
    } else {
        console.warn('MQTT not connected, cannot publish message');
        showAlert('MQTT tidak terhubung, gagal mengirim pesan!', 'warning');
    }
}

// Update MQTT status UI
function updateMQTTStatus(connected) {
    if (connected) {
        mqttStatus.classList.add('connected');
    } else {
        mqttStatus.classList.remove('connected');
    }
}

// Feed fish function with enhanced animation
function feedFish() {
    if (!isFoodAvailable) {
        showAlert('Pakan habis! Silakan isi ulang.', 'warning');
        return;
    }

    feedButton.disabled = true;
    feedButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memberi Pakan...';
    feedButton.style.transform = 'scale(0.95)';

    publishMessage(MQTT_CONFIG.topics.feed, 'manual_feed', { qos: 0 });
    showAlert('Perintah memberi pakan telah dikirim!', 'info', 3000);

    setTimeout(() => {
        feedButton.disabled = false;
        feedButton.innerHTML = '<i class="fas fa-fish mr-2"></i> Beri Pakan Sekarang';
        feedButton.style.transform = 'scale(1)';
    }, 2000);
}

// Update schedule UI
function updateScheduleUI() {
    const scheduleInputs = document.querySelectorAll('.schedule-time');
    scheduleInputs.forEach((input, index) => {
        if (selectedSchedule[index]) {
            input.value = selectedSchedule[index];
        }
    });
}

// Handle schedule input changes
function handleScheduleInput() {
    const scheduleInputs = document.querySelectorAll('.schedule-time');
    scheduleInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const newTime = e.target.value;
            if (newTime && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newTime)) {
                selectedSchedule[index] = newTime;
                console.log(`Temporary schedule update ${index === 0 ? 'morning' : index === 1 ? 'evening' : 'night'}:`, newTime);
            } else {
                showAlert('Format waktu tidak valid!', 'error');
            }
        });
    });
}

// Handle schedule saving
function handleScheduleSaving() {
    saveScheduleButton.addEventListener('click', () => {
        const morningTime = selectedSchedule[0];
        const eveningTime = selectedSchedule[1];
        const nightTime = selectedSchedule[2];

        if (!morningTime || !eveningTime || !nightTime) {
            showAlert('Harap isi semua jadwal (Pagi, Sore, dan Malam)!', 'warning');
            return;
        }

        saveScheduleButton.style.transform = 'scale(0.95)';

        if (morningTime) {
            publishMessage(MQTT_CONFIG.topics.schedule_morning, JSON.stringify({
                time: morningTime,
                timestamp: new Date().toISOString()
            }), { qos: 0, retain: true });
        }

        if (eveningTime) {
            publishMessage(MQTT_CONFIG.topics.schedule_evening, JSON.stringify({
                time: eveningTime,
                timestamp: new Date().toISOString()
            }), { qos: 0, retain: true });
        }

        if (nightTime) {
            publishMessage(MQTT_CONFIG.topics.schedule_night, JSON.stringify({
                time: nightTime,
                timestamp: new Date().toISOString()
            }), { qos: 0, retain: true });
        }

        setTimeout(() => {
            saveScheduleButton.style.transform = 'scale(1)';
        }, 200);

        showAlert('Jadwal berhasil disimpan dan dikirim ke Arduino!', 'success');
        console.log('Saved schedules:', selectedSchedule);
    });
}

// Initialize dashboard
function initDashboard() {
    initMQTT();
    feedButton.addEventListener('click', feedFish);
    handleScheduleInput();
    handleScheduleSaving();
    updateScheduleUI();

    // Initialize with default values
    updateFoodStatus(true);
    updateWaterLevel(50);
    updateTurbidity(0.0);
    updateTemperature(27.0);

    // Redraw gauges on window resize
    window.addEventListener('resize', () => {
        updateWaterLevel(currentWaterLevel);
        updateTurbidity(currentTurbidity);
        updateTemperature(currentTemperature);
    });

    // Add smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';
    
    showAlert('Dashboard berhasil diinisialisasi!', 'success', 2000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initDashboard);