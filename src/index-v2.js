const {dialog} = require('electron').remote;
const Chart = require('chart.js');
const {PythonShell} = require('python-shell')
const exec = require('child_process').execFile;

var MAX_PROCESSES = 6
var active_processes = 0

var totalFiles = 0
var fileNames = []
var filesToCheck = []
var previewFilename = null
var fileProperties = []

var chosenProperty = null
var g1_guess = null
var g2_guess = null
var low_cutoff = null
var high_cutoff = null

var analysis_filenames = []
var analysis_results = []
var analysis_results_graphdata = {}

//Document setup
function setupDocument(){
	resetAnalysis();
	$('#firstPage').height($(window).height())
	$('#firstPage').css('background-image','url("../res/HeaderImg.png")')
}

function resetAnalysis(){
	totalFiles = 0
	fileNames = []
	filesToCheck = 0
	previewFilename = null
	fileProperties = []

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
	$('#resultsTableBody').empty();
}

function load_files(){
	var files = dialog.showOpenDialog({ properties: ['openFile', 'multiSelections']}).then(result => {
	if (result.filePaths.length > 0){
		fileNames = []
		fileProperties = []
		filesToCheck = result.filePaths
		totalFiles = result.filePaths.length
		loadingScreen(true, "Checking files. "+filesToCheck.length+" file(s) remaining.")
		//TODO: limit number of concurrent requests
		for (i=0; i < Math.min(filesToCheck.length,MAX_PROCESSES); i++){
			check_file(filesToCheck.pop());
		}
	}
})}

function load_all_files(){
	let args = ['load_all_files', chosenProperty]

	for (let i=0; i < fileNames.length; i++){
		args.push(fileNames[i])
	}

	exec(process.cwd()+'/src/python/dist/cycler_wrapper/cycler_wrapper.exe', args, function (err, results) {
		console.log(results);
	});
}

function check_file(filename){

	let args = ['check_file', filename]

	args.push()
	exec(process.cwd()+'/src/python/dist/cycler_wrapper/cycler_wrapper.exe', args, function (err, results) {
		if (err != null){
			console.log(err);
		}

		results = JSON.parse(results)
		if (results[0] == 0){
			fileNames.push(results[1]);
			let params = results[2]

			for (let i=0; i < params.length; i++){
				if (fileProperties.indexOf(params[i]) < 0){
					fileProperties.push(params[i]);
				}
			}
		}

		loadingScreen(true, "Checking files. "+(totalFiles - fileNames.length)+" file(s) remaining.")

		if (fileNames.length == totalFiles){
			$('#continueButton').removeClass('disabled');
			loadingScreen(false)
			$("#secondPage").get(0).scrollIntoView();
			$("#secondPage").removeClass('disabled');

			$('#paramDropdownMenu').empty();
			for (let i=0; i < fileProperties.length; i++){
				$('#paramDropdownMenu').append("<div class='item' data-value='"+fileProperties[i]+"'>"+fileProperties[i]+"</div>");
			}
		}
		else if (filesToCheck.length > 0) {
			check_file(filesToCheck.pop());
		}
	});
}

function loadingScreen(enabled, message){
	if (enabled){
		$("#loadingModal").modal('show');
	}
	else if (!enabled){
		$("#loadingModal").modal('hide');
	}
	$("#loadingText").text(message)
}

function changeFileProperty(val){
	loadingScreen(true,"Generating preview.")
	//graph loading
	chosenProperty = val

	let args = ['get_preview', chosenProperty]

	for (let i=0; i < fileNames.length; i++){
		args.push(fileNames[i])
	}

	exec(process.cwd()+'/src/python/dist/cycler_wrapper/cycler_wrapper.exe', args, function (err, results) {
		draw_histogram(JSON.parse(results));
	});
}

function draw_histogram(data){
	resetParameters();

	let hist_data = hist(data, -1);

	let graph_data = hist_data[0];
	let buckets = hist_data[1];

	$('#analysisChart').remove();
	$('#chartContainer').append("<canvas id='analysisChart' width='400' height='300'></canvas>");
	let ctx = $('#analysisChart');
	Chart.defaults.global.legend.display = false;
	var myChart = new Chart(ctx, {
		type: 'line',
		data: {
			labels: buckets.map(String),
			datasets: [{
				data: graph_data,
				backgroundColor: 'rgba(255, 99, 132, 0.2)',
				borderColor: 'rgba(255, 99, 132, 1)',
				borderWidth: 1
				}]
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

	loadingScreen(false)
	//$("#paramDimmer").addClass('active')
	paramDimmer(true,'G0/G1 estimate')

	$('#analysisChart').click(function(evt) {
		try {
			let index = myChart.getElementsAtEvent(evt)[0]._index
			if (g1_guess == null){
				g1_guess = buckets[index]
				$('#g1_text').text(g1_guess.toFixed(2))
				paramDimmer(true,'G2/M estimate')
			}
			else if (g2_guess == null){
				g2_guess = buckets[index]
				paramDimmer(true,'Low Cutoff');
				$('#g2_text').text(g2_guess.toFixed(2))
			}
			else if (low_cutoff == null){
				low_cutoff = buckets[index]
				paramDimmer(true,'High Cutoff');
				$('#low_text').text(low_cutoff.toFixed(2))
			}
			else if (high_cutoff == null){
				high_cutoff = buckets[index]
				paramDimmer(false);
				$('#high_text').text(high_cutoff.toFixed(2))
			}
		}
		catch (error) {
			console.error(error);
		}

		if ((g1_guess != null)&&(g2_guess != null)){
			$("#selectedParamSegment").removeClass('disabled')
		}
	});
}

function start_analysis(){
	loadingScreen(true, "Waiting for first file to finish analysis.")
	for (let i =0; i < Math.min(fileNames.length, MAX_PROCESSES); i++){
		run_analysis(fileNames.pop())
	}
}

function run_analysis(fn){
		let args = ["run_analysis", chosenProperty, g1_guess, g2_guess, low_cutoff, high_cutoff, fn]

		exec(process.cwd()+'/src/python/dist/cycler_wrapper/cycler_wrapper.exe', args, function (err, results) {
			if (err != null){
				console.log(err)
			}

			results = JSON.parse(results);
			let filenameWithExtension = results[0].split('\\').pop().split('/').pop();
			let res = results[1];

			analysis_filenames.push(results[0]);
			analysis_results.push(res)

			let trunc_fn = filenameWithExtension.replace(/\./g,'')

			$('#resultsTableBody').append("\
					<tr>\
					  <td data-label='Filename'>"+filenameWithExtension+"</td>\
					  <td data-label='G1/G0 Pct'>"+res['g1_pct'].toFixed(2)+"</td>\
					  <td data-label='G2/M Pct'>"+res['g2_pct'].toFixed(2)+"</td>\
					  <td data-label='S Pct'>"+res['s_pct'].toFixed(2)+"</td>\
					  <td data-label='View'><div id='"+trunc_fn+"' class='ui tiny button'>View</div></td>\
			</tr>");

			$('#'+trunc_fn).click(function(){
				load_analysis(results[0]);
			});

			load_analysis_to_dict(results[0])

			$('#resultsTable').tablesort();
			loadingScreen(false);

			if (fileNames.length > 0){
				run_analysis(fileNames.pop());
			}

			loadingScreen(false, "Waiting for first file to finish analysis.")
			if ($("#thirdPage").hasClass('disabled')){
				$("#thirdPage").removeClass('disabled');
			}
		});

		$("#thirdPage").get(0).scrollIntoView();
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

function load_analysis(fn){
	let fileName = fn;
	let arguments = [chosenProperty, fileName];

	let analysisIndex = analysis_filenames.indexOf(fileName)
	show_analysis_results(analysis_results_graphdata[fileName][0],analysis_results[analysisIndex].g1_opt,analysis_results[analysisIndex].g2_opt)
}

function load_analysis_to_dict(fn){
	let fileName = fn;
	let args = ["get_data", chosenProperty, fileName];

	let analysisIndex = analysis_filenames.indexOf(fileName)

	exec(process.cwd()+'/src/python/dist/cycler_wrapper/cycler_wrapper.exe', args, function (err, results) {
		results = JSON.parse(results)
		load_to_dict(fn,results,analysis_results[analysisIndex].g1_opt,analysis_results[analysisIndex].g2_opt)
	});
}

function load_to_dict(fileName,data,g1_params,g2_params){
	analysis_results_graphdata[fileName] = [data, g1_params, g2_params]
}

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

function show_analysis_results(data,g1_params,g2_params){
	let hist_data = hist(data, -1, low_cutoff, high_cutoff);

	let graph_data = hist_data[0];
	let buckets = hist_data[1];

	$('#resultsChart').remove();
	$('#resultsChartContainer').append("<canvas id='resultsChart' width='400' height='300'></canvas>");
	let ctx = $('#resultsChart');

	var myChart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: buckets.map(String),
			datasets: [{
				data: graph_data,
				backgroundColor: 'rgba(100, 100, 100, 0.2)',
				borderColor: 'rgba(100, 100, 100, 0.3)',
				borderWidth: 1
				},
				{
				type: 'line',
				data: normal_dist(buckets,g1_params[0],g1_params[1],g1_params[2]),
				backgroundColor: 'rgba(46,92,184, 0.2)',
				borderColor: 'rgba(46,92,184, 1)',
				borderWidth: 1
				},
				{
				type: 'line',
				data: normal_dist(buckets,g2_params[0],g2_params[1],g2_params[2]),
				backgroundColor: 'rgba(198, 26, 255, 0.2)',
				borderColor: 'rgba(198, 26, 255, 1)',
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

function normal_dist(range,max_val,x_loc,std){
	let y_values = []

	for (let i=0; i<range.length; i++){
		let x = range[i]
		let y = (max_val/(std*Math.sqrt(2*Math.PI)))*Math.exp(-0.5*Math.pow((x-x_loc)/std,2))
		y_values.push(y)
	}

	return y_values
}
