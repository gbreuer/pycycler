# Takes csv input with columns
# and returns bimodal histogram analysis
# Author - Greg Breuer - gregory.breuer@yale.edu
# v0.11 - Fixed to auto-scale to mean value of 50 to make sure curve_fitting parameters are optimized appropriately

#TODO: Delete matplotlib

import numpy as np
from numpy import mean, size, zeros, where, transpose
from scipy import linspace, signal, arange
from scipy.optimize import curve_fit
from scipy.integrate import quad
from math import sqrt,pi
from sklearn.neighbors import KernelDensity
from matplotlib.pyplot import hist, savefig
import matplotlib.pyplot as plt

def normal_curve(x,a,b,c):
	return a*np.exp((-(x-b)**2)/(2*(c**2)))/(c)
	#return a*np.exp((-(x-b)**2)/(2*(c**2)))/(c*np.sqrt(2*pi))

def quadratic(x,a,b,c,d):
	return a*(x-d)**2 + b*(x-d) + c

def run_analysis(data, x_min, x_max):
	values = data

	#fig, ax = plt.subplots(1, 1, sharex=True, sharey=True)
	#fig.subplots_adjust(hspace=0.05, wspace=0.05)

	#kd = KernelDensity(bandwidth=0.75)
	kd = KernelDensity(bandwidth=0.50)

	#filter values based on set limits - scale so mean of data is >= 50 so that curve fit works better?
	mean_val = np.mean(values)
	scale_x = 1

	if mean_val < 50:
		scale_x = 50/mean_val

	#count sub_g1 and sup_g2 values
	values = np.array(values)
	total_events = len(values)
	sub_g1_count = len(np.where(values<x_min)[0])
	sup_g2_count = len(np.where(values>x_max)[0])
	filt_values = values[values>x_min]
	filt_values = filt_values[filt_values<x_max]
	filt_values *= scale_x
	values *= scale_x

	kd.fit(filt_values[:, None])
	x_vals = linspace(0,max(values),int(len(values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)

	#Identifying first peak:
	#TODO: Make more robust for >1 max
	#skip top 5% and bottom 5% of distribution to eliminate garbage mapping at this stage
	g1_max_index = where(dens==max(dens))[0][0]
	g2_max_index = None

	g1_sd_diff = g2_sd_diff = 0

	#determine location of peak (left or right)
	#TODO: See if this is right?
	try:
		upper_max = max(dens[int(1.8*g1_max_index):int(2.2*g1_max_index)])
	except:
		upper_max = -1
	try:
		lower_max = max(dens[int(g1_max_index/2.2):int(g1_max_index/1.8)])
	except:
		lower_max = -1

	#TODO: More screening to make sure right peak is chosen rather than simple max...
	if upper_max < lower_max:
		g2_max_index = g1_max_index
		g1_max_index = where(dens==lower_max)[0][0]
	else:
		g2_max_index = where(dens==upper_max)[0][0]

	for i in range(len(dens[:g1_max_index])):
		if dens[g1_max_index-i] < 0.6*dens[g1_max_index]:
			g1_sd_diff = i
			break

	start_guess = [dens[g1_max_index], x_vals[g1_max_index][0], x_vals[g1_max_index][0]-x_vals[g1_max_index-g1_sd_diff][0]]

	#this WAS 3*g1_sd_diff
	g1_start_index = g1_max_index - int(1.5*g1_sd_diff)

	if g1_start_index < 0:
		g1_start_index = 0

	x_range = x_vals[g1_start_index:g1_max_index+g1_sd_diff][:,0]
	y_range = dens[g1_start_index:g1_max_index+g1_sd_diff]

	g1_opt, cov = curve_fit(normal_curve, x_range, y_range, start_guess)

	for i in range(len(dens[g2_max_index:])):
		if dens[g2_max_index+i] < 0.6*dens[g2_max_index]:
			g2_sd_diff = i
			break

	#this WAS 3*g2_sd_diff
	start_guess = [dens[g2_max_index],x_vals[g2_max_index][0],x_vals[g2_max_index][0]-x_vals[g2_max_index-g2_sd_diff][0]]
	x_range = x_vals[g2_max_index-int(0.5*g2_sd_diff):g2_max_index+int(1.5*g2_sd_diff)][:,0]
	y_range = dens[g2_max_index-int(0.5*g2_sd_diff):g2_max_index+int(1.5*g2_sd_diff)]

	g2_opt, cov = curve_fit(normal_curve, x_range, y_range,start_guess)

	#Integrate to get areas: integrate KDE to normalize, then G1 and G2 to subtract
	start_x = x_vals[g1_start_index]

	g2_end_index = g2_max_index+2*g2_sd_diff
	if g2_end_index > len(x_vals):
		print("***WARNING: G2 Peak Extends Beyond X_Vals***")
		g2_end_index = len(x_vals)

	end_x = x_vals[g2_end_index]
	#TODO: see what root problem is
	KDE_area = quad(lambda x: np.exp(kd.score_samples([[x]])), start_x, end_x)
	g1_area = quad(normal_curve, start_x, x_vals[g1_max_index+2*g1_sd_diff], args=(g1_opt[0],g1_opt[1],g1_opt[2]))
	g2_area = quad(normal_curve, x_vals[g2_max_index-2*g2_sd_diff], x_vals[g2_max_index+2*g2_sd_diff], args=(g2_opt[0],g2_opt[1],g2_opt[2]))

	g1_pct = g1_area[0]/KDE_area[0]
	g2_pct = g2_area[0]/KDE_area[0]
	s_pct = 1-(g1_area[0] + g2_area[0])/KDE_area[0]
	#img_file = file_location[:file_location.rfind('.')]+'.png'

	#remove scaling factor
	values /= scale_x
	filt_values /= scale_x

	#Display graph
	#ax.fill(x_vals[:, 0], np.exp(log_dens), fc='#AAAAFF')
	#ax.fill(x_vals, dens, fc='#123B67')
	#ax.hist(values,int(sqrt(len(values))),density=True,color='#002D5C')
	#ax.plot(x_vals/scale_x, normal_curve(x_vals/scale_x, g2_opt[0]*scale_x, g2_opt[1]/scale_x, g2_opt[2]/scale_x),color='red')
	#ax.fill(x_vals/scale_x, normal_curve(x_vals/scale_x, g2_opt[0]*scale_x, g2_opt[1]/scale_x, g2_opt[2]/scale_x),fc='red',alpha=0.7)
	#ax.plot(x_vals/scale_x, normal_curve(x_vals/scale_x, g1_opt[0]*scale_x, g1_opt[1]/scale_x, g1_opt[2]/scale_x),color='yellow')
	#ax.fill(np.insert(x_vals/scale_x,0,[0]), np.insert(normal_curve(x_vals/scale_x, g1_opt[0]*scale_x, g1_opt[1]/scale_x, g1_opt[2]/scale_x),0,[0]),fc='yellow', alpha=0.7)

	#with open(file_location[:file_location.rfind('.')]+'.png','w') as f:
	#	savefig(f,bbox_inches='tight')
	#plt.close('all')

	return {'g1_pct': g1_pct,'g2_pct': g2_pct, 's_pct': s_pct, 'fig': fig, 'low_count': sub_g1_count, 'high_count': sup_g2_count,'total_count': total_events}

def run_experimental_analysis(data, x_min, x_max, g1_guess, g2_guess, target_range=100.):
	raw_values = data

	#count sub_g1 and sup_g2 values
	raw_values = np.array(raw_values).astype(float)
	total_events = len(raw_values)
	sub_g1_count = len(np.where(raw_values<x_min)[0])
	sup_g2_count = len(np.where(raw_values>x_max)[0])
	filt_values = raw_values[raw_values>x_min]
	filt_values = filt_values[filt_values<x_max]

	#TODO: check math
	low = np.percentile(filt_values,0.5)
	filt_values -= low
	raw_values -= low
	high = np.percentile(filt_values,99.5)
	filt_values *= target_range/high
	raw_values *= target_range/high
	x_min = (x_min - low)*(target_range/high)
	x_max = (x_max - low)*(target_range/high)
	g1_guess = (g1_guess - low)*(target_range/high)
	g2_guess = (g2_guess - low)*(target_range/high)

	fig, ax = plt.subplots(1, 1, sharex=True, sharey=True)
	fig.subplots_adjust(hspace=0.05, wspace=0.05)

	#Calculate and plot Kernel Density
	kd = KernelDensity(bandwidth=0.02*target_range)
	kd.fit(filt_values[:, None])
	x_vals = linspace(min(filt_values), max(filt_values), int(len(filt_values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)
	ax.plot(x_vals,dens)

	#Calculate G1
	g1_peak_value = np.exp(kd.score_samples([[g1_guess]])[0])
	g1_std = (np.mean(filt_values)-g1_guess)/2
	start_guess = [g1_peak_value, g1_guess, g1_std]
	x_vals = linspace(g1_guess*0.9, g1_guess*1.1, int(len(filt_values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)

	x_range = x_vals[:,0]
	y_range = dens

	g1_opt, cov = curve_fit(normal_curve, x_range, y_range, start_guess, bounds=([0,g1_guess*0.75,0],[1,g1_guess*1.25,(np.mean(filt_values)-g1_guess)]))

	#Calculate G2
	g2_peak_value = np.exp(kd.score_samples([[g2_guess]])[0])
	g2_std = (g2_guess-np.mean(filt_values))/2
	start_guess = [g2_peak_value, g2_guess, g1_opt[2]]
	x_vals = linspace(g2_guess*0.9, g2_guess*1.1, int(len(filt_values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)

	x_range = x_vals[:,0]
	y_range = dens

	g2_opt, cov = curve_fit(normal_curve, x_range, y_range, start_guess, bounds=([0,g2_guess*0.75,0],[1,g2_guess*1.25,(g2_guess-np.mean(filt_values))]))

	x_vals = linspace(min(raw_values), max(raw_values), int(len(raw_values)))[:,None]

	#Integrate to get areas: integrate KDE to normalize, then G1 and G2 to subtract
	start_x = min(x_vals)
	end_x = max(x_vals)

	#TODO: see what root problem is
	KDE_area = quad(lambda x: np.exp(kd.score_samples([[x]])), start_x, end_x)
	g1_area = quad(normal_curve, start_x, end_x, args=(g1_opt[0],g1_opt[1],g1_opt[2]))
	g2_area = quad(normal_curve, start_x, end_x, args=(g2_opt[0],g2_opt[1],g2_opt[2]))

	g1_pct = g1_area[0]/KDE_area[0]
	g2_pct = g2_area[0]/KDE_area[0]
	s_pct = 1-(g1_area[0] + g2_area[0])/KDE_area[0]

	#Display graph
	ax.fill(x_vals[:, 0], np.exp(kd.score_samples(x_vals)), fc='#AAAAFF')
	#ax.fill(x_vals, dens, fc='#123B67')
	ax.hist(raw_values,int(sqrt(len(raw_values))),density=True,color='#002D5C')
	ax.plot(x_vals, normal_curve(x_vals, g2_opt[0], g2_opt[1], g2_opt[2]),color='red')
	ax.fill(x_vals, normal_curve(x_vals, g2_opt[0], g2_opt[1], g2_opt[2]),fc='red',alpha=0.7)
	ax.plot(x_vals, normal_curve(x_vals, g1_opt[0], g1_opt[1], g1_opt[2]),color='yellow')
	ax.fill(np.insert(x_vals,0,[0]), np.insert(normal_curve(x_vals, g1_opt[0], g1_opt[1], g1_opt[2]),0,[0]),fc='yellow', alpha=0.7)

	#Readjust for scaling
	#g1_max_val = len(filt_values)*g1_opt[0]
	g1_max_val = len(filt_values)*normal_curve(g1_opt[1],g1_opt[0],g1_opt[1],g1_opt[2])
	g1_peak = low+g1_opt[1]/(target_range/high)
	g1_opt_std = g1_opt[2]/(target_range/high)
	#g2_max_val = len(filt_values)*g2_opt[0]
	g2_max_val = len(filt_values)*normal_curve(g2_opt[1],g2_opt[0],g2_opt[1],g2_opt[2])
	g2_peak = low+g2_opt[1]/(target_range/high)
	g2_opt_std = g2_opt[2]/(target_range/high)

	#with open('D:\\Users\\GregoryBreuer\\Desktop\\test.png','w') as f:
	f = 'D:\\Users\\GregoryBreuer\\Desktop\\test.png'
	savefig(f,bbox_inches='tight')
	plt.close('all')

	#return {'g1_pct': g1_pct,'g2_pct': g2_pct, 's_pct': s_pct, 'fig': fig, 'low_count': sub_g1_count, 'high_count': sup_g2_count,'total_count': total_events,'g1_opt':[g1_max_val, g1_peak, g1_opt_std],'g2_opt':[g2_max_val, g2_peak, g2_opt_std]}
	return {'g1_pct': g1_pct,'g2_pct': g2_pct, 's_pct': s_pct, 'fig': None, 'low_count': sub_g1_count, 'high_count': sup_g2_count,'total_count': total_events,'g1_opt':[g1_max_val, g1_peak, g1_opt_std],'g2_opt':[g2_max_val, g2_peak, g2_opt_std]}

def run_experimental_nofig_analysis(data, x_min, x_max, g1_guess, g2_guess, target_range=100.):
	res = run_experimental_analysis(data, x_min, x_max, g1_guess, g2_guess, target_range=100.)
	del res['fig']
	return res
