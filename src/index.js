const {dialog} = require('electron').remote;
const Chart = require('chart.js');
let {PythonShell} = require('python-shell')

var fileNames = []
var filesToCheck = 0
var previewFilename = null
var fileProperties = []

var chosenProperty = null
var g1_guess = null
var g2_guess = null
var low_cutoff = null
var high_cutoff = null

function advanceTab(){
	if ($('#beginTab').hasClass("active")){
		setStep('analysis')
	}
	else if ($('#analysisTab').hasClass("active")){
		setStep('results')
	}
}

function backTab(){
	if ($('#analysisTab').hasClass("active")){
		setStep('begin')
	}	
}

function load_files(){
	var files = dialog.showOpenDialog({ properties: ['openFile', 'multiSelections']}).then(result => {
	if (result.filePaths.length > 0){
		fileNames = []
		fileProperties = []
		filesToCheck = result.filePaths.length
		loadingScreen(true, "Checking files. "+filesToCheck+" file(s) remaining.")
		for (i=0; i < result.filePaths.length; i++){
			check_file(result.filePaths[i])
		}
	}
})}

function check_file(filename){
	let options = {
		args: [filename]
	};
	
	PythonShell.run(process.cwd()+'/src/python/check_file.py', options, function (err, results) {
		if (results[0] == "0"){
			fileNames.push(results[1]);
			let params = results[2].replace(/'/g,"");
			params = params.replace(/ /g,"");
			params = params.slice(1,params.length-1).split(",")
			
			for (let i=0; i < params.length; i++){
				if (fileProperties.indexOf(params[i]) < 0){
					fileProperties.push(params[i])
				}
			}
		}
		filesToCheck--;
		loadingScreen(true, "Checking files. "+filesToCheck+" file(s) remaining.")
		if (filesToCheck == 0){
			$('#continueButton').removeClass('disabled');
			loadingScreen(false)
			
			$('#paramDropdownMenu').empty();
			for (let i=0; i < fileProperties.length; i++){
				$('#paramDropdownMenu').append("<div class='item' data-value='"+fileProperties[i]+"'>"+fileProperties[i]+"</div>");
			}
		}
	});
}

function loadingScreen(enabled, message){
	if (enabled && !$("#loadingDimmer").hasClass('active')){
		$("#loadingDimmer").addClass('active');
	}
	else if (!enabled){
		$("#loadingDimmer").removeClass('active');
	}
	$("#loadingText").text(message)
}

function changeFileProperty(val){
	loadingScreen(true,"Generating preview.")
	//graph loading
	chosenProperty = val
	console.log(chosenProperty)
	let arguments = [val]
	
	for (let i=0; i < fileNames.length; i++){
		arguments.push(fileNames[i])
	}
	
	console.log(arguments)
	
	let options = {
		args: arguments
	};
	
	PythonShell.run(process.cwd()+'/src/python/get_preview.py', options, function (err, results) {
		console.log(results);
		console.log(err);
		draw_histogram(JSON.parse(results[0]));
	});
}

function setStep(id) {
	$('#'+id).prevAll().removeClass('active')
	$('#'+id).addClass('active')
	$('#'+id).nextAll().addClass('disabled').removeClass('active');
		
	if (id == 'begin'){
		checkBegin();	
	}
	else if (id == 'analysis'){
		checkAnalysis();
	}
	
	$.tab('change tab', id)
}

function checkBegin(){
	$('#backButton').addClass('disabled')
	
	if (fileNames.length > 0){
		$("#continueButton").removeClass('disabled')
	}
	else {
		$("#continueButton").addClass('disabled')
	}
}

function checkAnalysis(){
	$('#backButton').removeClass('disabled')
	
	//draw graph, etc
	
	//TODO: check if parameters are set
	if (false){
		$("#continueButton").removeClass('disabled')
	}
	else {
		$("#continueButton").addClass('disabled')
	}
}

function draw_histogram(data){	
	resetParameters();
	
	//set max data size
	if (data.length > 5000){
		let new_data = []
		
		for (let i=0; i < data.length; i++){
			new_data.push(data[Math.floor(Math.random()*data.length)])
		}
		
		data = new_data.slice()
	}
	
	console.log(data)
	console.log(Math.min.apply(Math, data))
	
	let minx = Math.min.apply(Math, data)
	let maxx = Math.max.apply(Math, data)	
	
	let num_buckets = Math.round(Math.min(Math.sqrt(data.length),(maxx-minx+1)));
	var bin_width = (maxx-minx)/num_buckets
	
	console.log(num_buckets)
	
	var buckets = []
	var graph_data = []
	
	for (let i = 0; i < num_buckets; i++){
		buckets.push(minx+i*bin_width)
		graph_data.push(0)
	}
	
	console.log(buckets)
	
	//TODO: take random sample
	for (let i = 0; i < data.length; i++){
		for (let j = 0; j < num_buckets; j++){
			if (buckets[j] > data[i]) {
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
	console.log(graph_data)
	$('#analysisChart').remove();
	$('#chartContainer').append("<canvas id='analysisChart' width='400' height='300'></canvas>");
	let ctx = $('#analysisChart');
	Chart.defaults.global.legend.display = false;
	var myChart = new Chart(ctx, {
		type: 'bar',	
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
				$('#g1_text').text(g1_guess)
				paramDimmer(true,'G2/M estimate')
			}
			else if (g2_guess == null){
				g2_guess = buckets[index]
				paramDimmer(true,'Low Cutoff');
				$('#g2_text').text(g2_guess)
			}
			else if (low_cutoff == null){
				low_cutoff = buckets[index]
				paramDimmer(true,'High Cutoff');
				$('#low_text').text(low_cutoff)
			}
			else if (high_cutoff == null){
				high_cutoff = buckets[index]
				paramDimmer(false);
				$('#high_text').text(high_cutoff)
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

function run_analysis(){	
	for (let i=0; i < fileNames.length; i++){
	
		let arguments = [chosenProperty, g1_guess, g2_guess, low_cutoff, high_cutoff, fileNames[i]]
	
		let options = {
			args: arguments
		};
		
		PythonShell.run(process.cwd()+'/src/python/run_analysis.py', options, function (err, results) {
			console.log(results)
		});
		
	}
	
	advanceTab();
}

function resetParameters(){
	g1_guess = null
	g2_guess = null
	low_cutoff = null
	high_cutoff = null
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