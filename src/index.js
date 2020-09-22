const {dialog} = require('electron').remote;
const ipc = require('electron').ipcRenderer;
const Chart = require('chart.js');
const chartjs_annotation = require('chartjs-plugin-annotation');
const temp = require('temp');
const fs = require('fs');
const zmq = require("zeromq");
const path = require('path');
const sharp = require('sharp');

temp.track();

var GRAPH_COLORS = ['rgba(126,83,255,0.2)','rgba(212,83,255,0.2)','rgba(83,172,255,0.2)']
var IMAGE_TYPES = ['.png','.jpg','.jpeg','.tiff','.tif','.bmp']
var active_processes = 0

var selected_preview_image = null;
var file_selection_button_lookup = {};

var totalFiles = 0
var fileNames = []
var filesToCheck = []
var previewFilename = null
var previewChart = null
var fileProperties = []
var file_data_dict = {}
var selectedPreviewFiles = []

var chosenProperty = null
var g1_guess = null
var g2_guess = null
var low_cutoff = null
var high_cutoff = null
var analysis_std = null
var preview_data = []

var image_filenames = [];

var analysis_filenames = []
var analysis_results = []
var analysis_results_graphdata = {}

var ultimateFileList = {};

var socket = zmq.socket("pair");

class File {
	constructor(filePath) {
		this.shortName = path.basename(filePath);
		this.data_filename = '';
		this.checked = false;
		this.is_image = false;
		this.failed = false;
		this.results = {};
		this.params = [];
		this.data = [];
		this.is_analyzed = false;
	}
}

var shell = require('electron').shell;
//open links externally by default
$(document).on('click', 'a[href^="http"]', function(event) {
		event.preventDefault();
		shell.openExternal(this.href);
});

$(document).ready(() => {
	loadingScreen(true, "Setting up analysis pipeline...");
	$('.tabular menu .item').tab();

	let holder = document.getElementById('drag-file');

	holder.ondragover = () => {
			return false;
	};

	holder.ondragleave = () => {
			return false;
	};

	holder.ondragend = () => {
			return false;
	};

	holder.ondrop = (e) => {
			e.preventDefault();

			let filesToLoad = [];
			for (let f of e.dataTransfer.files) {
					filesToLoad.push(f.path);
			}

			if (filesToLoad.length > 0){
				load_files(filesToLoad);
			}

			return false;
	};
});

setupMainProcessIPC();
setupZeroMQ();

function setupMainProcessIPC(){
	ipc.on('mainjs-error', (event, message) => {
		errorMessage(true, message);
	});
	ipc.on('mainjs-message', (event, message) => {
		console.log("ERROR in main.js");
	});
}

function setupZeroMQ(){
	socket.connect("tcp://127.0.0.1:4242");
	socket.on("message", zmq_broker);
	socket.send(JSON.stringify(['ready']));
}

//Parse messages sent from python to zeroMQ
function zmq_broker(message){
	results = JSON.parse(message);

	switch (results[0]){
		case 'OK':
			loadingScreen(false);
			break;

		case 'test':
			socket.send('OK');
			break;

		case 'check_file':
			check_file_handler(results[1]);
			break;

		case 'load_all_files':
			load_all_files_handler(results[1]);
			break;

		case 'run_analysis':
			if (results[1][0] == "preview"){
				$('#beginAnalysisButton').removeClass('loading');
				run_first_analysis_handler(results[1]);
			}
			else{
				run_analysis_handler(results[1]);
			}
			break;

		case 'preview_image_analysis':
			$('#previewImg').attr('src',results[1][1]);

			let data = results[1][2];
			drawPreviewImageAnalysis(data);
			break;

		case 'analyze_image':
			let results_filename = results[1][2];
			check_file(results_filename);
			break;

		default:
			console.log(message.toString())
		}
}

//Document setup
function setupDocument(){
	resetAnalysis();
}

function changeTab(tabname){
	$('#tabMenu').children().each(function(){
		if ($(this).attr("data-tab") == tabname){
			$(this).addClass('active');
		}
		else {
			$(this).removeClass('active');
		}
	});
	$.tab('change tab', tabname);
}

function resetAnalysis(){
	totalFiles = 0
	fileNames = []
	filesToCheck = 0
	previewFilename = null
	fileProperties = []
	selectedPreviewFiles = []

	chosenProperty = null
	g1_guess = null
	g2_guess = null
	low_cutoff = null
	high_cutoff = null

	analysis_filenames = []
	analysis_results = []
	analysis_results_graphdata = {}

	$('#paramDropdownMenu').empty();
	$('#continueButton').addClass('disabled');

	$('#analysisChart').remove();
	$('#chartContainer').empty();
	$('#resultsTable').empty();
}

//LOADING FILES FOR ANALYSIS
function check_file(filename){
	let args = ['check_file', filename];

	args.push();
	socket.send(JSON.stringify(args));
}

async function changeImageFile(val){
	//TODO: check directory structure on production
	selected_preview_image = val;
	let fileType = path.extname(val);
	let resName = path.resolve(__dirname,'./res/previewImage.png');

	await sharp(val).png().toFile(resName);
	$('#previewImg').attr('src',resName);
}

function previewImageAnalysis(){
	let img_filename = selected_preview_image;
	let tempFilename = path.basename(img_filename, path.extname(img_filename));

	let minThreshold = 0;
	let maxThreshold = 255;
	let nucDiameter = $('#nucDiameterInput').val();

	temp.open({ prefix: tempFilename, suffix: ".png"}, function(err, info) {
		if (!err){
			let args = ['preview_image_analysis', img_filename, info.path, minThreshold, maxThreshold, nucDiameter];

			args.push();

			socket.send(JSON.stringify(args));
		}
	});
}

function drawPreviewImageAnalysis(data){
	$('#imageChartContainer').empty();
	//$('#imageChartContainer').append("<canvas id='previewImageAnalysisChart' width='400' height='300' style='border:3px solid #dedede'></canvas>");
	$('#imageChartContainer').append("<canvas id='previewImageAnalysisChart' style='height:200px'></canvas>");

	let ctx=$('#previewImageAnalysisChart');
	draw_histogram(ctx,data,false);
}

function runImageAnalysis(){
	totalFiles = image_filenames.length;
	loadingScreen(true, "Beginning image analysis...");

	for (let i=0; i < image_filenames.length; i++){
		let img_filename = image_filenames[i];
		let tempFilename = path.basename(img_filename, path.extname(img_filename));

		let minThreshold = 0;
		let maxThreshold = 255;
		let nucDiameter = $('#nucDiameterInput').val();

		temp.open({ prefix: tempFilename, suffix: ".png"}, function(err, info) {
			if (!err){
				temp.open({ prefix: tempFilename, suffix: ".csv"}, function(err2, info2){
					if (!err2){
						ultimateFileList[info2.path] = new File(info2.path);
						let args = ['analyze_image', img_filename, info.path, minThreshold, maxThreshold, nucDiameter, info2.path];

						args.push();
						socket.send(JSON.stringify(args));
					}
				});
			}
		});
	}
}

function check_file_handler(results){
	if (results[0] == 0){
		ultimateFileList[results[1]].checked = true;
		ultimateFileList[results[1]].params = results[2];
	}

	updateFileDependencies();
}

function updateFileDependencies() {
	params = [];
	//TODO: Fix this to check all files
	for (let i=0; i < Object.keys(ultimateFileList).length; i++){
		if (ultimateFileList[Object.keys(ultimateFileList)[i]].params.length > 0){
			fileProperties = ultimateFileList[Object.keys(ultimateFileList)[i]].params;
		}
	}

	$('#paramDropdownMenu').empty();

	for (let i=0; i < fileProperties.length; i++){
		$('#paramDropdownMenu').append("<div class='item' data-value='"+fileProperties[i]+"'>"+fileProperties[i]+"</div>");
	}

	$('#drag-file').removeClass('loading');
	changeTab('file_select');
}


function load_file_dialog(){
	var files = dialog.showOpenDialog({ properties: ['openFile', 'multiSelections']}).then(result => {
		if (result.filePaths.length > 0){
			load_files(result.filePaths);
		}
	});
}

function print_to_console(msg, is_error=false){
	let d = new Date();

		let h = d.getHours().toString().padStart(2,'0');
		let m = d.getMinutes().toString().padStart(2,'0');
		let s = d.getSeconds().toString().padStart(2,'0');

	let timestamp = "[ "+h+":"+m+":"+s+" ] - ";

	if (is_error){
		$('#console').append("<p style='color:red; font-weight:bold'>"+timestamp+" "+msg+"</p>");
	}
	else {
		$('#console').append("<p>"+timestamp+msg+"</p>");
	}

	$('#console').scrollTop($('#console')[0].scrollHeight);
}

function load_files(file_list){
	resetAnalysis();
	$('#drag-file').addClass('loading');
	if (file_list.length > 0){
		fileNames = []
		fileProperties = []
		filesToCheck = file_list;
		totalFiles = file_list.length;

		//Files must all be of same type.
		var fileType = path.extname(filesToCheck[0]);

		loadingScreen(true, "Checking files. "+filesToCheck.length+" file(s) remaining.");
		print_to_console("Checking files. "+filesToCheck.length+" file(s) remaining.");

		for (i=0; i < filesToCheck.length; i++){
			let fileName = filesToCheck[i];
			let thisFileType = path.extname(fileName);
			let file = new File(fileName);
			ultimateFileList[fileName] = file;

			if (thisFileType != fileType){
				let err_msg = "Attempted to load files of different types: "+fileType+" and "+thisFileType;
				print_to_console(err_msg,true);
				errorMessage(true,err_msg);
				file.failed = true;
			}
			else if (IMAGE_TYPES.indexOf(fileType) >= 0){
				file.is_image = true;
				image_filenames.push(fileName);
				$('#imageDropdownMenu').append("<div class='item' data-value='"+fileName+"'>"+path.basename(fileName)+"</div>");
			}
			else {
				file.data_filename = fileName;
				check_file(fileName);
			}
		}
	}
}

function load_all_files(){
	let tempdatafile = "tdf"
	temp.open(tempdatafile, function(err, info) {
		console.log("writing temp "+info.path);
		if (!err){
			let args = ['load_all_files', chosenProperty, info.path]

			for (let i=0; i < Object.keys(ultimateFileList).length; i++){
				args.push(Object.keys(ultimateFileList)[i]);
			}

			socket.send(JSON.stringify(args));
		}
	});
}

function load_all_files_handler(results){
	fs.readFile(results[0], function(err,data){
		if (!err){
			let file_data_dict = JSON.parse(data);

			for (let i=0; i < Object.keys(file_data_dict).length; i++){
				let filename = Object.keys(file_data_dict)[i]
				ultimateFileList[filename].data = file_data_dict[filename];
			}

			draw_file_selection();
			selectAllFilesForPreview();
			//TODO: go to appropriate tab
			make_preview();
		}
	});
}

function draw_file_selection(){
	file_selection_button_lookup = {}
	$("#filePickerModalContent").empty();

	let max_x = null;
	let min_x = null;

	for (let i=0; i < Object.keys(ultimateFileList).length; i++){
		let file = ultimateFileList[Object.keys(ultimateFileList)[i]]
		if (file.data.length > 0) {
			let filenameWithExtension = file.shortName;

			let temp_min = Math.min.apply(Math,file.data);
			let temp_max = Math.max.apply(Math,file.data);

			if ((max_x == null)||(temp_max > max_x)) {
				max_x = temp_max;
			}

			if ((min_x == null)||(temp_min < min_x)) {
				min_x = temp_min;
			}

			//let trunc_fn = filenameWithExtension.replace(/\./g,'')
			$("#filePickerModalContent").append("\
			<div class='card' id='button_"+i+"'>\
				<div class='image'>\
					<canvas height='200px' id='previewChart"+i+"'></canvas>\
				</div>\
				<div class='content'>\
					<a class='ui green right corner label'><i class='check icon'></i></a>\
					<div class='header'>"+filenameWithExtension+"\
				</div>\
			</div>");
			$("#button_"+i).click(function(){
				if ($("#button_"+i).find('.label').css('visibility') == 'visible'){
					$("#button_"+i).find('.label').css('visibility','hidden');
					selectedPreviewFiles.splice(selectedPreviewFiles.indexOf(Object.keys(ultimateFileList)[i]),1);
				}
				else {
					$("#button_"+i).find('.label').css('visibility','visible');
					selectedPreviewFiles.push(Object.keys(ultimateFileList)[i]);
				}
				make_preview();
			});
		}
	}

	for (let i=0; i < Object.keys(ultimateFileList).length; i++) {
		let file = ultimateFileList[Object.keys(ultimateFileList)[i]];
		if (file.data.length > 0){
			let ctx=$('previewChart'+i);
			draw_histogram('previewChart'+i,file.data,false,min_x=min_x,max_x=max_x);
		}
	}
}

function selectAllFilesForPreview(){
	$("#filePickerModalContent").find('.label').css('visibility','visible');
	selectedPreviewFiles = [];

	for (let i=0; i < Object.keys(ultimateFileList).length; i++){
		let file = ultimateFileList[Object.keys(ultimateFileList)[i]];
		if (file.data.length > 0){
			selectedPreviewFiles.push(Object.keys(ultimateFileList)[i]);
		}
	}

	make_preview();
}

function removeAllFilesForPreview(){
	$("#filePickerModalContent").find('.label').css('visibility','hidden');
	selectedPreviewFiles = [];
	make_preview();
}

function closeFilePickerModal(){
	changeTab('analysis_settings');
}

function load_analysis(fn){
	let results = ultimateFileList[fn].results.fit_data;
	show_new_analysis_results(results[0],results[1],results[2],results[3],results[4]);
}

function make_preview(){
	let filenames = Object.keys(ultimateFileList);
	let min_length = Math.floor(25000/selectedPreviewFiles.length);
	for (let i=0; i < filenames.length; i++){
		if (selectedPreviewFiles.indexOf(filenames[i]) != -1){
			min_length = Math.min(ultimateFileList[filenames[i]].data.length,min_length);
		}
	}

	preview_data = []
	for (let i=0; i < filenames.length; i++){

		if (selectedPreviewFiles.indexOf(filenames[i]) != -1){
			for (let j=0; j < min_length; j++){
					preview_data.push(ultimateFileList[filenames[i]].data[Math.floor(Math.random()*ultimateFileList[filenames[i]].data.length)]);
			}
		}
	}

	$('#analysisChart').remove();
	$('#chartContainer').append("<canvas id='analysisChart' width='400' height='300'></canvas>");
	let ctx = $('#analysisChart');
	resetParameters();
	previewChart = draw_histogram(ctx,preview_data);

	loadingScreen(false)
	paramDimmer(true,'G0/G1 estimate')

	$('#analysisChart').click( function(evt) {
		try {
			let index = previewChart.getElementsAtXAxis(evt)[0]._index
			let value = parseFloat(previewChart.scales["x-axis-0"].ticks[index]);
			if (g1_guess == null){
				g1_guess = value
				$('#g1_text').text(g1_guess.toFixed(2))
				paramDimmer(true,'G2/M estimate')
			}
			else if (g2_guess == null){
				g2_guess = value
				paramDimmer(true,'Low Cutoff');
				$('#g2_text').text(g2_guess.toFixed(2))
			}
			else if (low_cutoff == null){
				low_cutoff = value
				paramDimmer(true,'High Cutoff');
				$('#low_text').text(low_cutoff.toFixed(2))
			}
			else if (high_cutoff == null){
				high_cutoff = value
				paramDimmer(false);
				$('#high_text').text(high_cutoff.toFixed(2))
			}

			previewChart.options.annotation.annotations = get_annotations();
			previewChart.update();
		}
		catch (error) {
			console.error(error);
		}

		if ((g1_guess != null)&&(g2_guess != null)){
			$("#selectedParamSegment").removeClass('disabled')
		}
	});
}

function changeFileProperty(val){
	loadingScreen(true,"Generating preview.")
	if ((chosenProperty == val)&&(file_data_dict.length > 0)){
		make_preview();
	}
	else{
		chosenProperty = val;
		load_all_files();
	}
}

//Generates lines/boxes to overlay on top of analysis to show sites picked for
//initial curve fitting estimates.
function get_annotations(){
	let annotation_array = []

	if (g1_guess != null){
		annotation_array.push({
			type: 'line',
			scaleID: 'x-axis-0',
			value: g1_guess,
			borderColor: 'rgba(0,0,0,0.25)',
			borderWidth: 2
		})
	}

	if (g2_guess != null){
		annotation_array.push({
			type: 'line',
			scaleID: 'x-axis-0',
			value: g2_guess,
			borderColor: 'rgba(0,0,0,0.25)',
			borderWidth: 2
		})
	}

	if (low_cutoff != null){
		annotation_array.push({
			type: 'box',
			xScaleID: 'x-axis-0',
			yScaleID: 'y-axis-0',
			xMin: low_cutoff,
			xMax: low_cutoff,
			yMin: 0,
			yMax: previewChart.scales["y-axis-0"].max,
			borderColor: 'rgba(100,100,100,0.25)',
			backgroundColor: 'rgba(100,100,100,0.1)',
			borderWidth: 2
		})
	}

	if (high_cutoff != null){
		annotation_array.push({
			type: 'box',
			xScaleID: 'x-axis-0',
			yScaleID: 'y-axis-0',
			xMin: low_cutoff,
			xMax: high_cutoff,
			yMin: 0,
			yMax: previewChart.scales["y-axis-0"].max,
			borderColor: 'rgba(100,100,100,0.25)',
			backgroundColor: 'rgba(100,100,100,0.1)',
			borderWidth: 2
		})
	}

	return annotation_array;
}


function draw_histogram(ctx, data, tooltips_enabled=true, min_x=null, max_x=null){
	let hist_data = hist(data, -1, min_x=min_x, max_x=max_x);

	let graph_data = hist_data[0];
	let buckets = hist_data[1];

	annotation_array = get_annotations()

	Chart.defaults.global.legend.display = false;
	return new Chart(ctx, {
		type: 'line',
		plugins: [chartjs_annotation],
		data: {
			labels: buckets,
			datasets: [{
				data: graph_data,
				backgroundColor: 'rgba(255, 99, 132, 0.2)',
				borderColor: 'rgba(255, 99, 132, 1)',
				borderWidth: 1
				}]
		},
		options: {
			annotation: {
				annotations: annotation_array
				},
			tooltips : { enabled: tooltips_enabled },
			scales: {
				xAxes: [{
					gridLines: { drawOnChartArea: false,
					 						drawTicks: false},
					ticks: { display: false	}
				}],
				yAxes: [{
					gridLines: { drawOnChartArea: false,
					 						drawTicks: false},
					ticks: { display: false	}
				}]
			}
		}
	});
}

//run only selected file preview data to obtain standard deviation
function run_first_analysis(){
	loadingScreen(true, "Running first pass analysis on aggregate data.");
	changeTab('results');
	$('#beginAnalysisButton').addClass('loading');
	let tempdatafile = "tdf"
	temp.open(tempdatafile, function(err,info) {
		if (!err) {
			fs.writeFile(info.path, JSON.stringify(preview_data), function(err) {
				if (!err){
					temp.open({suffix:'.png'}, function(err2,info2) {
						let args = ["run_analysis", chosenProperty, g1_guess, g2_guess, low_cutoff, high_cutoff, 'preview', info.path, info2.path]

						socket.send(JSON.stringify(args));
					});
				}
			});
		}
	});
}

function run_first_analysis_handler(results){
	let res = results[1]

	analysis_std = parseFloat(res["g1_opt"][2]);

	console.log("preview analysis back")
	start_analysis();
}

function start_analysis(){
	loadingScreen(true, "Waiting for first file to finish analysis.");

	for (let i =0; i < Object.keys(ultimateFileList).length; i++){
		let file = ultimateFileList[Object.keys(ultimateFileList)[i]];
		if (file.data.length > 0){
			run_analysis(Object.keys(ultimateFileList)[i]);
		}
	}
}

function run_analysis(fn){
	temp.open({suffix:'.png'}, function(err2,info2){
		let args = ["run_analysis", chosenProperty, g1_guess, g2_guess, low_cutoff, high_cutoff, fn, "", info2.path]

		if (analysis_std != null) {
			args.push(analysis_std)
		}

		socket.send(JSON.stringify(args));
	});
}

function run_analysis_handler(results){
	console.log(results[0]);
	//let filenameWithExtension = results[0].split('\\').pop().split('/').pop();
	let filenameWithExtension = path.basename(results[0]);
	let res = results[1];

	ultimateFileList[results[0]].results = res;
	ultimateFileList[results[0]].is_analyzed = true;

	loadingScreen(false);
	drawResultsTable();
}

function drawResultsTable(){
	$('#resultsBody').empty();
	for (let i = 0; i < Object.keys(ultimateFileList).length; i++){
		let filename = Object.keys(ultimateFileList)[i];
		let file = ultimateFileList[filename];

		let filenameWithExtension = path.basename(filename);
		let button_id = 'analysis_'+i.toString();

		if (file.is_analyzed) {
			$('#resultsBody').append("\
				<tr>\
					<td><button id='"+button_id+"' class='small ui labeled icon button'><i class='chart area icon'></i>"+path.basename(filenameWithExtension)+"</button></td>\
					<td>"+file.results['total_count'].toString()+"</td>\
					<td>"+(100*file.results['g1_pct']).toFixed(1)+"%</td>\
					<td>"+(100*file.results['g2_pct']).toFixed(1)+"%</td>\
					<td>"+(100*file.results['s_pct']).toFixed(1)+"%</td>\
				</tr>");

			$('#'+button_id).click(() => {buttonLoad(i)});
		}
	}
}

function buttonLoad(number){
	let fn = Object.keys(ultimateFileList)[number];
	load_analysis(fn);
}

function resetParameters(){
	g1_guess = null
	g2_guess = null
	low_cutoff = null
	high_cutoff = null
}

function download_csv(){
	let csvContent = "data:text/csv;charset=utf-8,";
	csvContent += "filename";

	let csv_categories = ['g1_pct','g2_pct','s_pct']

	for (let i=0; i < csv_categories.length; i++) {
		csvContent += ','+csv_categories[i];
	}

	csvContent += "\r\n";

	for (let i=0; i < Object.keys(ultimateFileList).length; i++){
		let file = ultimateFileList[Object.keys(ultimateFileList)[i]];
		let res = file.results;

		if (file.results != {}){
			csvContent += file.shortName+","+res['g1_pct'].toString()+","+res['g2_pct'].toString()+","+res['s_pct'].toString()+"\r\n";
		}
	}

	let encodedUri = encodeURI(csvContent);
	let link = document.createElement("a");
	link.setAttribute("href", encodedUri);
	link.setAttribute("download", "my_data.csv");
	document.body.appendChild(link);
	link.click();
}

function loadingScreen(enabled, message){
	if (enabled){
		$("#loadingModal").modal('show');
	}
	else if (!enabled){
		$("#loadingModal").modal('hide');
	}
	$("#loadingText").html(message)
}

function errorMessage(enabled, message){
	if (enabled){
		$("#loadingModal").modal('hide');
		$("#errorMsg").html(message);
		$("#errorModal").modal('show');
	}
	else {
		$("#messageModal").modal('hide');
	}
}

function paramDimmer(enabled, parameter){
	if (enabled){
		$("#paramDimmer").dimmer('show');
	}
	else if (!enabled){
		$("#paramDimmer").dimmer('hide');
	}
	$("#paramText").html("<i class='arrow left icon'></i>	Click chart to select "+parameter+".")
	$("#paramText").transition('pulse');
}

function draw_graph(){
	$('#analysisChart').remove();
	$('#chartContainer').append("<canvas id='analysisChart' width='400' height='300'></canvas>");
	let ctx = $('#analysisChart');
	let myChart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
			datasets: [{
				label: '# of Votes',
				data: [12, 19, 3, 5, 2, 3],
				backgroundColor: [
					'rgba(255, 99, 132, 0.2)',
					'rgba(54, 162, 235, 0.2)',
					'rgba(255, 206, 86, 0.2)',
					'rgba(75, 192, 192, 0.2)',
					'rgba(153, 102, 255, 0.2)',
					'rgba(255, 159, 64, 0.2)'
				],
				borderColor: [
					'rgba(255, 99, 132, 1)',
					'rgba(54, 162, 235, 1)',
					'rgba(255, 206, 86, 1)',
					'rgba(75, 192, 192, 1)',
					'rgba(153, 102, 255, 1)',
					'rgba(255, 159, 64, 1)'
				],
				borderWidth: 1
			}]
		},
		options: {
			scales: {
				yAxes: [{
					ticks: {
						beginAtZero: true
					}
				}]
			}
		}
	});
}

//Makes histogram from provided data.
function hist(data, max_values = 25000, min_x = null, max_x = null, remove_extremes=true){
	working_data = data.slice()

	if ((max_values > 0) && (working_data > max_values)){
		let new_data = []

		for (let i=0; i < working_data.length; i++){
			new_data.push(working_data[Math.floor(Math.random()*working_data.length)])
		}

		working_data = new_data.slice()
	}

	if (remove_extremes){
		working_data.sort(function(a, b){return a-b});
		max_x = working_data[Math.round(0.975 * working_data.length)];
	}

	let minx = Math.min.apply(Math, working_data);
	if (min_x != null){
		minx = min_x;
	}

	let maxx = Math.max.apply(Math, working_data);
	if (max_x != null){
		maxx = max_x;
	}

	let num_buckets = Math.round(2*Math.sqrt(working_data.length))
	let bin_width = (maxx-minx)/num_buckets

	let buckets = []
	let graph_data = []

	for (let i = 0; i < num_buckets; i++){
		buckets.push(minx+i*bin_width)
		graph_data.push(0)
	}

	//TODO: take random sample
	for (let i = 0; i < working_data.length; i++){
		for (let j = 0; j < num_buckets; j++){
			if (buckets[j] > working_data[i]) {
				if (j > 0){
					graph_data[j-1]++;
				}
				else {
					graph_data[j]++;
				}
				break;
			}
		}
	}

	return [graph_data, buckets]
}

//Loads analysis results to graph
function show_new_analysis_results(x_data,g1_data,g2_data,s_data,all_data){
		$('#resultsChart').remove();
		$('#resultsChartContainer').append("<canvas id='resultsChart' width='400' height='300'></canvas>");
		let ctx = $('#resultsChart');

		var myChart = new Chart(ctx,
			{
				type: 'bar',
				data: {
					labels: x_data.map(String),
					datasets: [{
						type: 'line',
						data: s_data,
						backgroundColor: GRAPH_COLORS[0],
						borderColor: GRAPH_COLORS[0],
						borderWidth: 1
						},
						{
						type: 'line',
						data: g1_data,
						backgroundColor: GRAPH_COLORS[1],
						borderColor: GRAPH_COLORS[1],
						borderWidth: 1
						},
						{
						type: 'line',
						data: g2_data,
						backgroundColor: GRAPH_COLORS[2],
						borderColor: GRAPH_COLORS[2],
						borderWidth: 1
					},
						{
						type: 'bar',
						data: all_data,
						backgroundColor: 'rgba(175,175,175,0.6)',
						borderColor: 'rgba(175,175,175,0.6)',
						borderWidth: 1
						}
						]
				},
				options: {
					scales: {
						xAxes: [{
								ticks: {
									callback: function(value) {
										return value.substr(0,4);
									},
								}
//							gridLines: { drawOnChartArea: false,
//													drawTicks: false},
//							ticks: { display: false	}
//						}],
//						yAxes: [{
//							ticks: { display: false	}
						}]
					}
				}
		});
}
