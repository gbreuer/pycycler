# Takes csv input with columns  and returns bimodal histogram analysis
# Author - Greg Breuer - gregory.breuer@yale.edu
# v0.11 - Fixed to auto-scale to mean value of 50 to make sure curve_fitting parameters are optimized appropriately

import numpy as np
from numpy import mean, size, zeros, where, transpose, linspace
from scipy import signal, arange
from scipy.optimize import curve_fit
from scipy.integrate import quad
from scipy.stats import norm
from math import sqrt,pi,ceil,floor
from sklearn.neighbors import KernelDensity

def normal_curve(x,a,b,c):
	return a*norm.pdf(x,b,c)

def twin_peaks(x,a1,a2,b,c):
	return normal_curve(x,a1,b,c)+normal_curve(x,a2,2*b,c)

def exponential(x,a,b):
	return a*x**b

def refined_analysis(data, x_min, x_max, g1_guess, g2_guess, stdev=-1, target_range=100., output_filename=None, correct_exp=True):
	x_min = 0
	FIT_MARGIN = 0.1
	raw_values = data

	lock_stdev = (stdev != -1)

	#count sub_g1 and sup_g2 values
	raw_values = np.array(raw_values).astype(float)
	total_events = len(raw_values)
	sub_g1_count = len(np.where(raw_values<x_min)[0])
	sup_g2_count = len(np.where(raw_values>x_max)[0])
	filt_values = raw_values[raw_values>x_min]
	filt_values = filt_values[filt_values<x_max]

	#select random 5000 values to keep calculation time lower
	filt_values = np.random.choice(filt_values,5000)

	if correct_exp:
		fit, cov = curve_fit(exponential, [0, g1_guess, g2_guess], [0.0, 15.0, 30.0])

		raw_values = exponential(raw_values, fit[0], fit[1])
		filt_values = exponential(filt_values, fit[0], fit[1])
		x_min = exponential(x_min, fit[0], fit[1])
		x_max = exponential(x_max, fit[0], fit[1])
		g1_guess = exponential(g1_guess, fit[0], fit[1])
		g2_guess = exponential(g2_guess, fit[0], fit[1])

	high = np.max(filt_values)
	filt_values *= target_range/high
	raw_values *= target_range/high
	x_min = (x_min)*(target_range/high)
	x_max = (x_max)*(target_range/high)
	g1_guess = (g1_guess)*(target_range/high)
	g2_guess = (g2_guess)*(target_range/high)
	stdev = (stdev)*(target_range/high)

	#Calculate and plot Kernel Density
	#kd = KernelDensity(bandwidth=0.02*target_range)
	kd = KernelDensity(bandwidth=0.005*target_range)
	kd.fit(filt_values[:, None])
	x_vals = linspace(min(filt_values), max(filt_values), int(len(filt_values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)
	if output_filename:
		ax.plot(x_vals,dens)

	#Calculate G1
	g1_peak_value = np.exp(kd.score_samples([[g1_guess]])[0])*4*np.pi
	g2_peak_value = np.exp(kd.score_samples([[g2_guess]])[0])*4*np.pi

	if not lock_stdev:
		stdev = 0.15*g1_guess

	start_guess = [g1_peak_value, g2_peak_value, g1_guess, stdev, 0, 0, 0.05, 1.5*g1_guess]
	#x_vals = linspace(g1_guess*0.9, g1_guess*1.1, int(len(filt_values)))[:,None]
	x_vals = linspace(g1_guess*0.75, 2*g1_guess*1.25, int(len(filt_values)))[:,None]
	log_dens = kd.score_samples(x_vals)
	dens = np.exp(log_dens)

	x_range = x_vals[:,0]
	#ignore x values between g1 and g2
	indices = np.where((x_range < 1.1*g1_guess) | (x_range > 1.9*g1_guess))
	x_range_peaks = x_range[indices]
	y_range_peaks = dens[indices]
	y_range = dens

	if lock_stdev:
		g1_opt, cov = curve_fit(twin_peaks, x_range_peaks, y_range_peaks, [g1_peak_value, g2_peak_value, g1_guess, stdev],\
			bounds=([0,0,(1-FIT_MARGIN)*g1_guess,0.95*stdev],[1,1,(1+FIT_MARGIN)*g1_guess,1.05*stdev]))
	else:
		g1_opt, cov = curve_fit(twin_peaks, x_range_peaks, y_range_peaks, [g1_peak_value, g2_peak_value, g1_guess, stdev],\
			bounds=([0,0,(1-FIT_MARGIN)*g1_guess,0.1*stdev],[1,1,(1+FIT_MARGIN)*g1_guess,1.2*stdev]))
		#g1_opt, cov = curve_fit(all_curves, x_range, y_range, start_guess, bounds=([0,0,g1_guess*0.95,0.001*target_range,-0.1,-50,0,g1_guess],[1,1,g1_guess*1.05,0.1*g1_guess,0.1,50,1,2*g1_guess]), maxfev=250)

	#TODO: adjust number of points taken here
	x_vals = linspace(min(filt_values), max(filt_values), 500)[:,None]
	#Integrate to get areas: integrate KDE to normalize, then G1 and G2 to subtract
	start_x = min(x_vals)
	end_x = max(x_vals)

	#TODO: see what root problem is
	KDE_area = quad(lambda x: np.exp(kd.score_samples([[x]])), start_x, end_x)
	g1_area = quad(normal_curve, start_x, end_x, args=(g1_opt[0],g1_opt[2],g1_opt[3]))
	g2_area = quad(normal_curve, start_x, end_x, args=(g1_opt[1],g1_opt[2],g1_opt[3]))

	g1_pct = g1_area[0]/KDE_area[0]
	g2_pct = g2_area[0]/KDE_area[0]
	s_pct = 1-(g1_area[0] + g2_area[0])/KDE_area[0]

	#Readjust for scaling
	g1_max_val = len(filt_values)*g1_opt[0]
	g1_peak = g1_opt[2]/(target_range/high)
	g1_opt_std = g1_opt[3]/(target_range/high)
	g2_max_val = len(filt_values)*g1_opt[1]
	g2_peak = 2*g1_opt[2]/(target_range/high)

	x_vals = linspace(min(filt_values), max(filt_values), 150)
	kd2 = KernelDensity(bandwidth=0.03*target_range)
	kd2.fit(filt_values[:, None])
	s_histogram = np.exp(kd2.score_samples(x_vals[:,None]))
	s_plot = s_histogram-(normal_curve(x_vals, g1_opt[1], 2*g1_opt[2], g1_opt[3]) + normal_curve(x_vals, g1_opt[0], g1_opt[2], g1_opt[3]))
	s_plot[np.where(s_plot < 0)] = 0
	s_plot[np.where(x_vals < g1_opt[2])] = 0
	s_plot[np.where(x_vals > 2*g1_opt[2])] = 0
	s_plot = np.array([np.mean(s_plot[max(0,i-5):min(len(s_plot)-1,i+6)]) for i in range(len(s_plot))])


	return_dict = {}
	return_dict['g1_pct'] = g1_pct
	return_dict['g2_pct'] = g2_pct
	return_dict['s_pct'] = s_pct
	return_dict['fig'] = None
	return_dict['low_count'] = sub_g1_count
	return_dict['high_count'] = sup_g2_count
	return_dict['total_count'] = total_events
	return_dict['fit_data'] = [x_vals.tolist(), normal_curve(x_vals, g1_opt[1], 2*g1_opt[2], g1_opt[3]).tolist(), normal_curve(x_vals, g1_opt[0], g1_opt[2], g1_opt[3]).tolist(), s_plot.tolist(), [0]+np.histogram(raw_values, bins=x_vals, normed=True)[0].tolist()]
	return_dict['g1_opt'] = [g1_max_val, g1_peak, g1_opt_std]
	return_dict['g2_opt'] = [g2_max_val, g2_peak, g1_opt_std]
	return return_dict
