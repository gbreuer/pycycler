const {dialog} = require('electron').remote;
const ipc = require('electron').ipcRenderer;
const Chart = require('chart.js');
const chartjs_annotation = require('chartjs-plugin-annotation');
const temp = require('temp');
const fs = require('fs');
const zmq = require("zeromq");

temp.track()

var GRAPH_COLORS = ['rgba(126,83,255,0.2)','rgba(212,83,255,0.2)','rgba(83,172,255,0.2)']
var active_processes = 0

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

var analysis_filenames = []
var analysis_results = []
var analysis_results_graphdata = {}

var socket = zmq.socket("pair");

var shell = require('electron').shell;
//open links externally by default
$(document).on('click', 'a[href^="http"]', function(event) {
		event.preventDefault();
		shell.openExternal(this.href);
});

$(document).ready(() => {
	loadingScreen(true, "Setting up analysis pipeline...");
	$('.tabular menu .item').tab();
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
	console.log("socket connected on port 4242");
	socket.on("message", zmq_broker);
	socket.send(JSON.stringify(['ready']));
}

//Parse messages sent from python to zeroMQ
function zmq_broker(message){
	results = JSON.parse(message);
	console.log(results);

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
	let args = ['check_file', filename]

	args.push()

	socket.send(JSON.stringify(args));
}

function check_file_handler(results){
		if ((results[0] == 0) && !(fileNames.includes(results[1]))){
			fileNames.push(results[1]);
			let params = results[2]

			for (let i=0; i < params.length; i++){
				if (fileProperties.indexOf(params[i]) < 0){
					fileProperties.push(params[i]);
				}
			}
		}

	loadingScreen(true, "Checking files. "+(totalFiles - fileNames.length)+" file(s) remaining.");

	if (fileNames.length == totalFiles){
		loadingScreen(false)
		$("#secondPage").removeClass('disabled');

		$('#paramDropdownMenu').empty();
		for (let i=0; i < fileProperties.length; i++){
			$('#paramDropdownMenu').append("<div class='item' data-value='"+fileProperties[i]+"'>"+fileProperties[i]+"</div>");
		}

		changeTab('file_select');
	}
	else if (filesToCheck.length > 0) {
		check_file(filesToCheck.pop());
	}
}

function load_files(){
	var files = dialog.showOpenDialog({ properties: ['openFile', 'multiSelections']}).then(result => {
	if (result.filePaths.length > 0){
		fileNames = []
		fileProperties = []
		filesToCheck = result.filePaths;
		totalFiles = result.filePaths.length;
		loadingScreen(true, "Checking files. "+filesToCheck.length+" file(s) remaining.");
		for (i=0; i < filesToCheck.length; i++){
			check_file(filesToCheck.pop());
		}
	}
})}

function load_all_files(){
	let tempdatafile = "tdf"
	temp.open(tempdatafile, function(err, info) {
		console.log("writing temp "+info.path);
		if (!err){
			let args = ['load_all_files', chosenProperty, info.path]

			for (let i=0; i < fileNames.length; i++){
				args.push(fileNames[i])
			}

			socket.send(JSON.stringify(args));
		}
	});
}

function load_all_files_handler(results){
	fs.readFile(results[0], function(err,data){
		if (!err){
			file_data_dict = JSON.parse(data);
			selectedPreviewFiles = Object.keys(file_data_dict);
			draw_file_selection();
			//TODO: go to appropriate tab
			make_preview();
		}
	});
}

function draw_file_selection(){
	$("#filePickerModalContent").empty();
	for (let i=0; i < Object.keys(file_data_dict).length; i++){
		let filenameWithExtension = Object.keys(file_data_dict)[i].split('\\').pop().split('/').pop();
		let trunc_fn = filenameWithExtension.replace(/\./g,'')
		$("#filePickerModalContent").append("\
		<div class='card' id='"+trunc_fn+"_button'>\
			<div class='image'>\
				<canvas height='200px' id='previewChart"+i+"'></canvas>\
			</div>\
			<div class='content'>\
				<a class='ui green right corner label'><i class='check icon'></i></a>\
				<div class='header'>"+filenameWithExtension+"\
			</div>\
		</div>");
		$("#"+trunc_fn+"_button").click(function(){
			if ($("#"+trunc_fn+"_button").find('.label').css('visibility') == 'visible'){
				$("#"+trunc_fn+"_button").find('.label').css('visibility','hidden');
				selectedPreviewFiles.splice(selectedPreviewFiles.indexOf(Object.keys(file_data_dict)[i]),1);
			}
			else {
				$("#"+trunc_fn+"_button").find('.label').css('visibility','visible');
				selectedPreviewFiles.push(Object.keys(file_data_dict)[i]);
			}
			make_preview();
		});
		let ctx=$('previewChart'+i);
		draw_histogram('previewChart'+i,file_data_dict[Object.keys(file_data_dict)[i]],false);
	}
}

function selectAllFilesForPreview(){
	$("#filePickerModalContent").find('.label').css('visibility','visible');
	selectedPreviewFiles = Object.keys(file_data_dict);
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
	let fileName = fn;
	let analysisIndex = analysis_filenames.indexOf(fileName)
	show_new_analysis_results(analysis_results_graphdata[fileName][0],analysis_results_graphdata[fileName][1],analysis_results_graphdata[fileName][2],analysis_results_graphdata[fileName][3],analysis_results_graphdata[fileName][4])
}

function load_analysis_to_dict(fn){
	let fileName = fn;
	let analysisIndex = analysis_filenames.indexOf(fileName)
	let analysis_data = analysis_results[analysisIndex].fit_data

	analysis_results_graphdata[fileName] = [analysis_data[0],analysis_data[1],analysis_data[2],analysis_data[3], analysis_data[4]]
}

function make_preview(){
	let filenames = Object.keys(file_data_dict);
	let min_length = Math.floor(15000/selectedPreviewFiles.length);
	for (let i=0; i < filenames.length; i++){
		if (selectedPreviewFiles.indexOf(filenames[i]) != -1){
			min_length = Math.min(file_data_dict[filenames[i]].length,min_length);
		}
	}

	preview_data = []
	for (let i=0; i < filenames.length; i++){

		if (selectedPreviewFiles.indexOf(filenames[i]) != -1){
			for (let j=0; j < min_length; j++){
					preview_data.push(file_data_dict[filenames[i]][Math.floor(Math.random()*file_data_dict[filenames[i]].length)]);
			}
		}
	}

	$('#analysisChart').remove();
	$('#chartContainer').append("<canvas id='analysisChart' width='400' height='300' style='border:3px solid #dedede'></canvas>");
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


function draw_histogram(ctx, data, tooltips_enabled=true){
	let hist_data = hist(data, -1);

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

	for (let i =0; i < fileNames.length; i++){
		run_analysis(fileNames.pop())
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
	let filenameWithExtension = results[0].split('\\').pop().split('/').pop();
	let res = results[1];

	if (!analysis_filenames.includes(results[0])){
		analysis_filenames.push(results[0]);
		analysis_results.push(res)

		let trunc_fn = filenameWithExtension.replace(/\./g,'')

		$('#resultsTable').append("\
        <a class='item' id='"+trunc_fn+"'>\
          <div class='content'>\
            <h5 class='header'>"+filenameWithExtension+"</h5>\
            <div class='description'>\
							<div class='ui center aligned basic segment'>\
                <div class='ui horizontal list'>\
                  <div class='item'><strong>G0/G1 %:</strong> "+res['g1_pct'].toFixed(2)+"</div>\
                  <div class='item'><strong>G2/M %:</strong> "+res['g2_pct'].toFixed(2)+"</div>\
                  <div class='item'><strong>S %:</strong> "+res['s_pct'].toFixed(2)+"</div>\
                </div>\
							</div>\
            </div>\
          </div>\
        </a>");

		$('#'+trunc_fn).click(function(){
			load_analysis(results[0]);
		});

		load_analysis_to_dict(results[0])

		loadingScreen(false);

		if (fileNames.length > 0){
			run_analysis(fileNames.pop());
		}
	}

	loadingScreen(false, "Waiting for first file to finish analysis.")
}

function resetParameters(){
	g1_guess = null
	g2_guess = null
	low_cutoff = null
	high_cutoff = null
}

function download_csv(){
	let csvContent = "data:text/csv;charset=utf-8,";
	for (let i=0; i < analysis_filenames.length; i++){
		let fn = analysis_filenames[i];
		let res = analysis_results[i];
		csvContent += fn+","+res['g1_pct'].toString()+","+res['g2_pct'].toString()+","+res['s_pct'].toString()+"\r\n";
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
function hist(data, max_values = 25000, min_x = null, max_x = null){
	working_data = data.slice()

	if ((max_values > 0) && (working_data > max_values)){
		let new_data = []

		for (let i=0; i < working_data.length; i++){
			new_data.push(working_data[Math.floor(Math.random()*working_data.length)])
		}

		working_data = new_data.slice()
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
						backgroundColor: GRAPH_COLORS[2],
						borderColor: GRAPH_COLORS[2],
						borderWidth: 1
						}
						]
				},
				options: {
					scales: {
						xAxes: [{
							ticks: {
								display: false
						}
					}]
				}
			}
		});
}
